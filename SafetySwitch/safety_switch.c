/* ================================================================
 * safety_switch.c  —  Çok katmanlı güvenlik anahtarı durum makinesi
 *
 * Güç yolu (4 eleman seri):
 *   24V ──► RELAY1 ──► RELAY2 ──► LED ──► MOSFET1 ──► MOSFET2 ──► GND
 *
 * Redundant güvenlik katmanları (7 adet):
 *
 *  [1] Complement saklama   — kritik değişkenler hem normal hem ~hali
 *                             olarak saklanır; uyuşmazlık → FAULT
 *  [2] ODR doğrulama        — her döngüde GPIO yazmaç değeri kontrol
 *  [3] Aktif re-assertion   — güvenli durumlarda GPIO her döngü yazılır
 *  [4] Strobe testi         — ACTIVE'de 10s'de bir brief OFF + ODR kontrol
 *  [5] Boot kilidi          — açılıştan 3s sonraya kadar aktivasyon yok
 *  [6] RC anti-glitch       — kanal N döngü HIGH olmalı
 *  [7] Bilinmeyen durum     — default: MCU reset (SW bütünlük arızası)
 * ================================================================ */
#include "main.h"
#include "safety_switch.h"
#include "safety_config.h"

/* ── [1] Complement (tamper-evident) saklama ─────────────────────
 *
 * Drone EMI ortamı: motor PWM harmonikleri, ESC anahtarlama,
 * güç rayı gürültüsü → ARM Cortex-M'de nadiren de olsa RAM
 * bit-flip (SEU) yapabilir.
 *
 * Her kritik değişken val + val'ın bit tersi (inv) olarak saklanır.
 * val == ~inv koşulu bozulursa → bellek bozulması → FAULT.
 * ──────────────────────────────────────────────────────────────── */
typedef struct { uint32_t v; uint32_t n; } su32_t;
typedef struct { uint8_t  v; uint8_t  n; } su8_t;

#define SU32_SET(s, x)   do { (s).v = (uint32_t)(x); \
                               (s).n = ~(uint32_t)(x); } while (0)
#define SU8_SET(s,  x)   do { (s).v = (uint8_t)(x); \
                               (s).n = (uint8_t)~(uint8_t)(x); } while (0)
#define SU32_OK(s)       ((s).v == ~(s).n)
#define SU8_OK(s)        ((s).v == (uint8_t)~(s).n)

/* Kritik durum değişkenleri — bellekte birbirinden uzak tutulsun diye
 * ikili gruplara ayrılmıştır (linker genellikle sıralı yerleştirir,
 * ama iki farklı .c dosyasına taşırsanız daha güçlü ayrım sağlanır). */
static su32_t  _state;          /* SwitchState_t cinsinden saklama  */
static su32_t  _state_ts;       /* son durum geçiş zamanı (ms)      */
static su32_t  _boot_ms;        /* sw_init çağrı zamanı             */
static su8_t   _rc_ok;          /* RC art arda HIGH sayacı          */
static su32_t  _last_strobe;    /* son strobe testi zamanı          */

/* Hangi değerin GPIO'ya yazıldığını takip eden shadow değerler */
static GPIO_PinState _cmd_relay = GPIO_PIN_RESET;
static GPIO_PinState _cmd_fet   = GPIO_PIN_RESET;

/* ── Bütünlük doğrulama ──────────────────────────────────────── */
static bool vars_intact(void)
{
    return SU32_OK(_state)
        && SU32_OK(_state_ts)
        && SU32_OK(_boot_ms)
        && SU8_OK (_rc_ok)
        && SU32_OK(_last_strobe);
}

/* ── [2] GPIO ODR doğrulama ─────────────────────────────────────
 * ODR (Output Data Register) yazılan değeri yansıtır.
 * Çevresel EMI pin sürücüsünü etkileyemez, ama yazmaç
 * bit-flip'ini yakalarız.
 * ──────────────────────────────────────────────────────────────── */
static bool pin_odr_is(GPIO_TypeDef *port, uint16_t pin, GPIO_PinState want)
{
    bool is_set = ((port->ODR & (uint32_t)pin) != 0u);
    return (want == GPIO_PIN_SET) ? is_set : !is_set;
}

static bool all_odrs_match(void)
{
    return pin_odr_is(CH1_RELAY_PORT, CH1_RELAY_PIN, _cmd_relay)
        && pin_odr_is(CH1_FET_PORT,   CH1_FET_PIN,   _cmd_fet)
        && pin_odr_is(CH2_RELAY_PORT, CH2_RELAY_PIN, _cmd_relay)
        && pin_odr_is(CH2_FET_PORT,   CH2_FET_PIN,   _cmd_fet);
}

/* ── GPIO kontrolü ───────────────────────────────────────────── */
static void outputs_off(void)
{
    /* MOSFET önce → akım kesilince relay açılır (ark önleme) */
    HAL_GPIO_WritePin(CH1_FET_PORT,   CH1_FET_PIN,   GPIO_PIN_RESET);
    HAL_GPIO_WritePin(CH2_FET_PORT,   CH2_FET_PIN,   GPIO_PIN_RESET);
    HAL_GPIO_WritePin(CH1_RELAY_PORT, CH1_RELAY_PIN, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(CH2_RELAY_PORT, CH2_RELAY_PIN, GPIO_PIN_RESET);
    _cmd_relay = GPIO_PIN_RESET;
    _cmd_fet   = GPIO_PIN_RESET;
}

static void outputs_on(void)
{
    /* Relay önce → 5ms sıçrama süresi → MOSFET (relay ark önleme) */
    HAL_GPIO_WritePin(CH1_RELAY_PORT, CH1_RELAY_PIN, GPIO_PIN_SET);
    HAL_GPIO_WritePin(CH2_RELAY_PORT, CH2_RELAY_PIN, GPIO_PIN_SET);
    HAL_Delay(5u);
    HAL_GPIO_WritePin(CH1_FET_PORT,   CH1_FET_PIN,   GPIO_PIN_SET);
    HAL_GPIO_WritePin(CH2_FET_PORT,   CH2_FET_PIN,   GPIO_PIN_SET);
    _cmd_relay = GPIO_PIN_SET;
    _cmd_fet   = GPIO_PIN_SET;
}

/* ── [3] Aktif güvenli durum re-assertion ────────────────────────
 * Güvenli durumlarda (SAFE_OFF, ARMING, FAULT) çıkışlar
 * her sw_update() döngüsünde yeniden LOW yazılır.
 *
 * Bu olmadan: ODR flip → FAULT → outputs_off() bir kez çağrılır
 * → sonraki döngüde tekrar kontrol edilir. Toplam pencere ~10ms.
 *
 * Bu sayede: herhangi bir ODR drift anında üzerine yazılır.
 * Ayrıca ODR doğrulama da devrede kaldığı için çift kontrol.
 * ──────────────────────────────────────────────────────────────── */
static void assert_safe_state(void)
{
    HAL_GPIO_WritePin(CH1_FET_PORT,   CH1_FET_PIN,   GPIO_PIN_RESET);
    HAL_GPIO_WritePin(CH2_FET_PORT,   CH2_FET_PIN,   GPIO_PIN_RESET);
    HAL_GPIO_WritePin(CH1_RELAY_PORT, CH1_RELAY_PIN, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(CH2_RELAY_PORT, CH2_RELAY_PIN, GPIO_PIN_RESET);
    _cmd_relay = GPIO_PIN_RESET;
    _cmd_fet   = GPIO_PIN_RESET;
}

/* ── Koşul değerlendirici ────────────────────────────────────── */
static bool conditions_met(const MavData_t *mav, uint32_t now)
{
    /* [5] Boot kilidi */
    if ((now - _boot_ms.v) < BOOT_LOCKOUT_MS) return false;

    if (!mav->initialised) return false;

    /* Heartbeat tazeliği */
    if (!mav_hb_fresh(mav, now)) return false;

    /* RC tazeliği: FC heartbeat gönderip RC mesajı kesmişse yakalar */
    if (mav->rc_count > 0u && ((now - mav->last_rc_ms) > RC_FRESH_MS))
        return false;

#if COND_ARMED
    if (!mav_is_armed(mav)) return false;
#endif

#if COND_RC_CHANNEL
    {
        uint16_t rc  = mav_rc(mav, RC_CHANNEL_NUM);
        SwitchState_t cur = (SwitchState_t)_state.v;

        if (cur == SW_ACTIVE) {
            /* Histerezis: ACTIVE'deyken LOW eşiğine düşünce kapat */
            if (rc < RC_LOW_TH) {
                SU8_SET(_rc_ok, 0u);
                return false;
            }
            /* Zaten HIGH bölgesindeyse sayacı doyum değerinde tut */
            if (_rc_ok.v < RC_CONFIRM_CYCLES)
                SU8_SET(_rc_ok, RC_CONFIRM_CYCLES);
        } else {
            /* [6] Anti-glitch: N döngü arka arkaya HIGH olmadan açılmaz */
            if (rc >= RC_HIGH_TH) {
                uint8_t next = (_rc_ok.v < 255u) ? (_rc_ok.v + 1u) : 255u;
                SU8_SET(_rc_ok, next);
            } else {
                SU8_SET(_rc_ok, 0u);
            }
            if (_rc_ok.v < RC_CONFIRM_CYCLES) return false;
        }
    }
#endif

#if COND_VOLTAGE
    if (mav->voltage_mv < BATT_MIN_MV) return false;
#endif

    return true;
}

/* ── Durum geçişi ────────────────────────────────────────────── */
static void enter(SwitchState_t s, uint32_t now)
{
    SU32_SET(_state,    (uint32_t)s);
    SU32_SET(_state_ts, now);

    if (s == SW_ACTIVE) {
        outputs_on();
    } else {
        outputs_off();
    }
}

/* ── [4] Strobe testi (ACTIVE durum periyodik doğrulama) ─────────
 *
 * Her STROBE_INTERVAL_MS'de bir:
 *   • Çıkışları STROBE_DURATION_MS (10ms) kapatır
 *   • ODR LOW olduğunu doğrular
 *   • Geri açar, ODR HIGH olduğunu doğrular
 *   • Herhangi başarısızlıkta false döner → FAULT
 *
 * Yan faydalar:
 *   • Relay kontaklarının uzun süre kapalı kalıp kaynaklanmasını önler
 *   • GPIO sürücüsünün her iki yönde çalıştığını aktif olarak doğrular
 *   • 10ms OFF / 10000ms = %0.1 duty cycle → LED'de görünmez
 * ──────────────────────────────────────────────────────────────── */
static bool strobe_test(uint32_t now)
{
    if ((now - _last_strobe.v) < STROBE_INTERVAL_MS) return true;

    outputs_off();
    HAL_Delay(STROBE_DURATION_MS);

    bool off_ok = all_odrs_match();   /* tüm ODR LOW olmalı */

    outputs_on();
    HAL_Delay(2u);                    /* relay oturma payı  */

    bool on_ok = all_odrs_match();    /* tüm ODR HIGH olmalı */

    SU32_SET(_last_strobe, now);
    return off_ok && on_ok;
}

/* ── Power-on self test ──────────────────────────────────────── */
bool sw_selftest(void)
{
    bool pass = true;

    #define TEST_PIN(port, pin)                                          \
    do {                                                                 \
        HAL_GPIO_WritePin((port), (pin), GPIO_PIN_SET);                  \
        HAL_Delay(2u);                                                   \
        if (((port)->ODR & (uint32_t)(pin)) == 0u) { pass = false; }    \
        HAL_GPIO_WritePin((port), (pin), GPIO_PIN_RESET);                \
        HAL_Delay(2u);                                                   \
        if (((port)->ODR & (uint32_t)(pin)) != 0u) { pass = false; }    \
    } while (0)

    /* MOSFET'ler kapalıyken relay bobinleri ~2ms kısaca enerjilendirilir.
     * Seri devre açık olduğundan LED kesinlikle yanmaz.                */
    TEST_PIN(CH1_RELAY_PORT, CH1_RELAY_PIN);
    TEST_PIN(CH2_RELAY_PORT, CH2_RELAY_PIN);
    TEST_PIN(CH1_FET_PORT,   CH1_FET_PIN);
    TEST_PIN(CH2_FET_PORT,   CH2_FET_PIN);

    #undef TEST_PIN

    outputs_off();
    return pass;
}

/* ── Genel API ───────────────────────────────────────────────── */
void sw_init(void)
{
    outputs_off();
    uint32_t now = HAL_GetTick();
    SU32_SET(_state,       (uint32_t)SW_SAFE_OFF);
    SU32_SET(_state_ts,    now);
    SU32_SET(_boot_ms,     now);
    SU8_SET (_rc_ok,       0u);
    SU32_SET(_last_strobe, now);
}

void sw_update(const MavData_t *mav, uint32_t now)
{
    /* ── Güvenlik kontrolleri (her döngü, sıralı) ──────────── */

    /* [1] Complement bütünlüğü: herhangi bir SEU/bellek bozulması */
    if (!vars_intact()) {
        outputs_off();
        SU32_SET(_state,    (uint32_t)SW_FAULT);
        SU32_SET(_state_ts, now);
        return;
    }

    /* [2] ODR doğrulama: GPIO yazmaç değeri beklenenle eşleşmeli */
    if (!all_odrs_match()) {
        outputs_off();
        SU32_SET(_state,    (uint32_t)SW_FAULT);
        SU32_SET(_state_ts, now);
        return;
    }

    SwitchState_t cur = (SwitchState_t)_state.v;

    /* [3] Aktif re-assertion: güvenli durumlarda GPIO her döngü yazılır.
     *     Bu, ODR doğrulama ile birlikte EMI penceresi sıfıra iner.    */
    if (cur != SW_ACTIVE) {
        assert_safe_state();
    }

    /* ── FSM geçişleri ─────────────────────────────────────── */
    bool ok = conditions_met(mav, now);

    switch (cur) {

    case SW_SAFE_OFF:
        if (ok) enter(SW_ARMING, now);
        break;

    case SW_ARMING:
        if (!ok) {
            enter(SW_SAFE_OFF, now);
        } else if ((now - _state_ts.v) >= ARM_CONFIRM_MS) {
            SU32_SET(_last_strobe, now);
            enter(SW_ACTIVE, now);
        }
        break;

    case SW_ACTIVE:
        if (!ok) {
            if (!mav_hb_fresh(mav, now)) {
                enter(SW_FAULT, now);
            } else {
                enter(SW_SAFE_OFF, now);
            }
        } else {
            /* [4] Strobe testi: ODR + relay döngüsü doğrulama */
            if (!strobe_test(now)) {
                enter(SW_FAULT, now);
            }
        }
        break;

    case SW_FAULT:
        if ((now - _state_ts.v) >= FAULT_LOCKOUT_MS) {
            SU8_SET(_rc_ok, 0u);
            enter(SW_SAFE_OFF, now);
        }
        break;

    /* [7] Bilinmeyen durum: kodun buraya ulaşması = bellek bozulması.
     *     Çıkışları kapat, kısa bekle (relay kapansın), MCU reset.    */
    default:
        outputs_off();
        HAL_Delay(50u);
        NVIC_SystemReset();
        break;
    }
}

SwitchState_t sw_state(void) { return (SwitchState_t)_state.v; }
