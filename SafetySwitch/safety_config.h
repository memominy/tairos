/* ================================================================
 * safety_config.h  —  Tüm kullanıcı parametreleri burada
 *
 * Devre topolojisi (seri, 4 elemanın hepsi ON olmadan akım geçmez):
 *   24V ──► RELAY1 ──► RELAY2 ──► LED ──► MOSFET1 ──► MOSFET2 ──► GND
 *   Ch1 = (RELAY1 + MOSFET1)   Ch2 = (RELAY2 + MOSFET2)
 *
 * ÖNEMLİ: Tüm 4 kontrol pininde PULL-DOWN direnç olmalı.
 *          MCU reset → GPIO LOW → tüm anahtarlar açık (güvenli).
 * ================================================================ */
#ifndef SAFETY_CONFIG_H
#define SAFETY_CONFIG_H

/* ── GPIO pinleri — şemana göre düzenle ──────────────────── */
#define CH1_RELAY_PORT      GPIOA
#define CH1_RELAY_PIN       GPIO_PIN_0   /* High-side relay 1 sürücüsü */

#define CH1_FET_PORT        GPIOA
#define CH1_FET_PIN         GPIO_PIN_1   /* Low-side MOSFET 1 gate     */

#define CH2_RELAY_PORT      GPIOA
#define CH2_RELAY_PIN       GPIO_PIN_2   /* High-side relay 2 sürücüsü */

#define CH2_FET_PORT        GPIOA
#define CH2_FET_PIN         GPIO_PIN_3   /* Low-side MOSFET 2 gate     */

/* ── MAVLink UART ─────────────────────────────────────────── */
/* Betaflight ayarı: Seri port → MAVLink 1 veya 2, aynı baud */
extern UART_HandleTypeDef huart1;
#define MAVLINK_HUART       huart1

/* ── Güvenlik zaman aşımları (ms) ───────────────────────── */
#define HB_TIMEOUT_MS       3000U   /* Bu kadar heartbeat gelmezse → FAULT */
#define ARM_CONFIRM_MS       500U   /* Koşullar bu kadar tutarsa → ACTIVE  */
#define FAULT_LOCKOUT_MS   10000U   /* FAULT sonrası bu kadar bekle         */

/* ── Aktivasyon koşulları (0 = devre dışı) ─────────────── */
#define COND_ARMED          1       /* FC armed olmalı                      */
#define COND_RC_CHANNEL     1       /* Belirli RC kanalı HIGH olmalı        */
#define COND_VOLTAGE        1       /* Batarya gerilimi yeterli olmalı      */

#define RC_CHANNEL_NUM      8U      /* 1-tabanlı; 8 = AUX1                  */
#define RC_HIGH_TH          1700U   /* µs — kanal HIGH sayılma eşiği        */
#define RC_LOW_TH           1300U   /* µs — histerezis: bu altına düşünce OFF */

#define BATT_MIN_MV         20000U  /* 20 V minimum (24 V sistem için)      */

/* ── Kritik ek güvenlik parametreleri ─────────────────── */

/* Açılış kilidi: güç gelince ilk N ms içinde aktivasyon yok.
 * MCU saati, gerilimler ve MAVLink bağlantısı bu sürede oturur. */
#define BOOT_LOCKOUT_MS     3000U

/* RC anti-glitch: kanal N döngü arka arkaya HIGH olmalı.
 * 10ms döngüde RC_CONFIRM_CYCLES=3 → 30ms filtre.
 * Transmitter sıçraması veya paket kaybını önler.             */
#define RC_CONFIRM_CYCLES      3U

/* MAVLink kaynak filtresi: yalnızca bu sysID'den gelen mesajlar
 * kabul edilir. Betaflight varsayılanı 1'dir.
 * 0 = filtre kapalı (test için).                              */
#define MAVLINK_FC_SYSID       1U

/* RC kanal tazeliği: heartbeat gelse bile RC mesajı bu kadar ms
 * içinde gelmemişse kanal geçersiz sayılır.                      */
#define RC_FRESH_MS           200U

/* Strobe testi: ACTIVE durumdayken her N ms'de bir çıkışlar
 * kısaca kapatılıp GPIO sürücüsü ve relay döngüsü test edilir.   */
#define STROBE_INTERVAL_MS  10000U   /* 10 saniyede bir            */
#define STROBE_DURATION_MS     10U   /* 10ms OFF — görünmez yanıp sönme */

#endif /* SAFETY_CONFIG_H */
