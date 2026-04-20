/* ================================================================
 * main_integration_snippet.c
 *
 * Bu dosyayı PROJEYE EKLEME — sadece bir entegrasyon rehberidir.
 * STM32CubeIDE tarafından oluşturulan main.c dosyasına aşağıdaki
 * kod parçalarını ilgili "USER CODE" bölgelerine ekle.
 * ================================================================ */

/* ────────────────────────────────────────────────────────────────
 * ADIM 1 — CubeMX Yapılandırması
 * ────────────────────────────────────────────────────────────────
 * GPIO (Output, Push-Pull, No Pull, Hız: Low):
 *   PA0  → CH1_RELAY  (başlangıç seviyesi: LOW)
 *   PA1  → CH1_FET    (başlangıç seviyesi: LOW)
 *   PA2  → CH2_RELAY  (başlangıç seviyesi: LOW)
 *   PA3  → CH2_FET    (başlangıç seviyesi: LOW)
 *
 * USART1 (Async):
 *   Baud: 57600 (Betaflight ile eşleşmeli)
 *   Global interrupt: ENABLE
 *
 * IWDG (Bağımsız Watchdog):
 *   Prescaler: 64  → Reload: 2000  → ~2 saniye pencere
 *   Eğer sw_update 2 sn içinde IWDG'yi beslemezse MCU reset → çıkışlar LOW
 *
 * SYS → Timebase Source: TIM1 (SysTick yerine, HAL_Delay için)
 * ──────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────
 * ADIM 2 — main.c İçine Eklenecek Parçalar
 * ──────────────────────────────────────────────────────────────── */

/* USER CODE BEGIN Includes */
#include "safety_config.h"
#include "mavlink_min.h"
#include "safety_switch.h"
#include "safety_post.h"
/* USER CODE END Includes */


/* USER CODE BEGIN PV */
/*
 * Çift tampon: ISR g_mav_isr'a yazar, main loop g_mav_safe'i okur.
 * __disable_irq/__enable_irq ile kısa kritik bölge → race condition yok.
 */
static volatile MavData_t g_mav_isr  = {0};   /* ISR yazar           */
static          MavData_t g_mav_safe = {0};   /* main loop okur      */
static volatile bool      g_mav_new  = false; /* yeni veri bayrağı   */
static uint8_t g_rx_byte;
/* USER CODE END PV */


/* USER CODE BEGIN 2  (HAL_Init, MX_GPIO_Init, MX_CRC_Init'ten SONRA) */

/* 1. Yığın canary yaz (ilk işlem olmalı — yığın henüz az kullanıldı) */
post_canary_init();

/* 2. Flash bütünlük kontrolü */
if (!post_flash_crc_ok()) {
    /* Firmware bozuk — asla aktivasyon yapma */
    while (1) {
        HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_13);
        HAL_Delay(50);
        HAL_IWDG_Refresh(&hiwdg);
    }
}

/* 3. GPIO sürücü self test */
sw_init();
if (!sw_selftest()) {
    while (1) {
        HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_13);
        HAL_Delay(100);
        HAL_IWDG_Refresh(&hiwdg);
    }
}

HAL_UART_Receive_IT(&MAVLINK_HUART, &g_rx_byte, 1);
/* USER CODE END 2 */


/* USER CODE BEGIN WHILE */
while (1)
{
    uint32_t now = HAL_GetTick();

    /* Çift tampon kopyalama: IRQ kısaca devre dışı → atomik kopyalama */
    if (g_mav_new) {
        __disable_irq();
        g_mav_safe = g_mav_isr;   /* struct kopyası */
        g_mav_new  = false;
        __enable_irq();
    }

    /* Yığın canary kontrolü — taşma varsa IWDG'yi beslemeden dur */
    if (!post_canary_ok()) {
        /* Yığın taşması: güvenli kapat, MCU'yu reset bekle */
        while (1) {
            HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_13);
            HAL_Delay(200);
            /* IWDG kasıtlı beslenmez → 2s sonra otomatik MCU reset */
        }
    }

    sw_update(&g_mav_safe, now);

    /* IWDG besleme — sw_update 2 sn içinde gelmezse MCU reset */
    HAL_IWDG_Refresh(&hiwdg);

    /*
     * Durum LED göstergesi (isteğe bağlı):
     *   SW_SAFE_OFF → yavaş yanıp sönme  (1000ms)
     *   SW_ARMING   → hızlı yanıp sönme  (200ms)
     *   SW_ACTIVE   → sürekli ON
     *   SW_FAULT    → iki kısa yanıp sönme, sonra duraklama
     */

    HAL_Delay(10);   /* ~100 Hz güncelleme hızı */
}
/* USER CODE END WHILE */


/* USER CODE BEGIN 4 */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == MAVLINK_HUART.Instance)
    {
        if (mavlink_feed_byte(g_rx_byte, (MavData_t *)&g_mav_isr)) {
            g_mav_new = true;   /* main loop'a yeni veri var sinyali */
        }
        HAL_UART_Receive_IT(&MAVLINK_HUART, &g_rx_byte, 1);
    }
}
/* USER CODE END 4 */


/* ────────────────────────────────────────────────────────────────
 * ADIM 3 — Betaflight Yapılandırması
 * ────────────────────────────────────────────────────────────────
 * Betaflight Configurator → Ports sekmesi:
 *   İlgili UART portunu bul → "Telemetry Output" → MAVLink seç
 *
 * CLI (gerekirse):
 *   set mavlink_version = 1
 *   save
 *
 * Aux switch (AUX1 = Kanal 8):
 *   Betaflight'ta Kanal 8'i bir anahtarınıza bağlayın.
 *   Transmitter'da anahtar HIGH (>1700µs) yaptığınızda LED açılır.
 * ──────────────────────────────────────────────────────────────── */


/* ────────────────────────────────────────────────────────────────
 * ADIM 4 — Donanım Kontrol Listesi
 * ────────────────────────────────────────────────────────────────
 * [ ] PA0, PA1, PA2, PA3 — 10kΩ pull-down GND'ye
 *     (MCU reset → GPIO yüksek empedans → pull-down → LOW → güvenli)
 * [ ] Relay sürücüleri için flyback diyot (relay bobini paraleline)
 * [ ] N-MOSFET gate için 10-100Ω seri direnç (osilayon önleme)
 * [ ] N-MOSFET gate-source arası 10kΩ pull-down
 * [ ] 24V ve MCU GND'leri ortak noktada birleşmeli (tek referans)
 * [ ] UART TX/RX çapraz bağlı olmalı (FC TX → STM32 RX)
 * [ ] UART gerilim uyumu: Betaflight 3.3V → STM32 3.3V (doğrudan OK)
 *     Betaflight 5V → 3.3V seviye kaydırıcı gerekli
 * ──────────────────────────────────────────────────────────────── */
