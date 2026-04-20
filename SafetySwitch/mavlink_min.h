/* ================================================================
 * mavlink_min.h  —  Minimal MAVLink v1/v2 frame parser arayüzü
 *
 * Desteklenen mesajlar:
 *   ID=0  HEARTBEAT       (armed durumu, sistem durumu)
 *   ID=1  SYS_STATUS      (batarya gerilimi, hata sayacı)
 *   ID=35 RC_CHANNELS_RAW (8 kanal, eski Betaflight)
 *   ID=65 RC_CHANNELS     (18 kanal, yeni Betaflight)
 * ================================================================ */
#ifndef MAVLINK_MIN_H
#define MAVLINK_MIN_H

#include <stdint.h>
#include <stdbool.h>
#include "safety_config.h"

typedef struct {
    /* HEARTBEAT */
    uint8_t  base_mode;       /* bit7=1 → ARMED                  */
    uint8_t  system_status;   /* MAV_STATE_ACTIVE = 4             */
    uint32_t last_hb_ms;      /* HAL_GetTick() an alındığında     */

    /* SYS_STATUS */
    uint16_t voltage_mv;      /* Batarya gerilimi mV cinsinden    */
    uint16_t errors_count;    /* errors_count1 alanı              */

    /* RC_CHANNELS */
    uint16_t rc[18];          /* 1-tabanlı ch1..ch18 (rc[0]=ch1)  */
    uint8_t  rc_count;
    uint32_t last_rc_ms;

    bool     initialised;     /* En az 1 heartbeat alındı mı      */
} MavData_t;

/*
 * Her UART baytını bu fonksiyona ver.
 * CRC geçerli bir çerçeve tamamlandığında true döner.
 * ISR içinden çağrılabilir.
 */
bool mavlink_feed_byte(uint8_t byte, MavData_t *out);

/* ── Yardımcı fonksiyonlar ───────────────────────────────── */

static inline bool mav_is_armed(const MavData_t *d)
{
    return d->initialised && ((d->base_mode & 0x80u) != 0u);
}

static inline bool mav_hb_fresh(const MavData_t *d, uint32_t now_ms)
{
    return d->initialised && ((now_ms - d->last_hb_ms) < HB_TIMEOUT_MS);
}

/* ch: 1-tabanlı kanal numarası; yoksa 0 döner */
static inline uint16_t mav_rc(const MavData_t *d, uint8_t ch)
{
    if (!d->initialised || ch < 1u || ch > d->rc_count) return 0u;
    return d->rc[ch - 1u];
}

#endif /* MAVLINK_MIN_H */
