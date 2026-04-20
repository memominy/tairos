/* ================================================================
 * safety_post.h  —  Açılış (power-on) bütünlük testleri
 *
 * Çağrı sırası (main.c içinde):
 *   1. HAL_Init()
 *   2. MX_GPIO_Init(), MX_CRC_Init() vb.
 *   3. post_canary_init()          ← yığın nöbetçisi yaz
 *   4. post_flash_crc_ok()         ← firmware bütünlüğü
 *   5. sw_init()
 *   6. sw_selftest()
 *   7. Ana döngü → her döngüde post_canary_ok() çağır
 * ================================================================ */
#ifndef SAFETY_POST_H
#define SAFETY_POST_H

#include <stdint.h>
#include <stdbool.h>

/* ── Yığın taşma dedektörü (stack canary) ─────────────────────
 * Cortex-M yığını yüksek adresten aşağı büyür.
 * Yığın tabanına (MSP - Min_Stack_Size) 4 × 0xDEADBEEF yazar.
 * Taşma bu değerleri üzerine yazar → post_canary_ok() false döner.
 *
 * NOT: MPU (Memory Protection Unit) daha güçlü bir alternatiftir.
 *      CubeMX → Middleware → CORTEX_M → Enable MPU → Stack Guard
 *      seçeneğini de etkinleştirin.
 * ──────────────────────────────────────────────────────────────── */
void post_canary_init(void);
bool post_canary_ok(void);

/* ── Flash CRC bütünlük kontrolü ─────────────────────────────
 * STM32 donanım CRC birimini kullanır (CubeMX'te etkinleştir).
 * Beklenen CRC değeri EXPECTED_FLASH_CRC ile sabitlenmelidir:
 *   → Derleme sonrası script: arm-none-eabi-objcopy + python CRC32
 *   → 0x00000000 ise kontrol atlanır (geliştirme modu).
 *
 * Gereksinim: CubeMX → CRC → Activated: Yes
 * ──────────────────────────────────────────────────────────────── */
bool post_flash_crc_ok(void);

#endif /* SAFETY_POST_H */
