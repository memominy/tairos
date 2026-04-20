/* ================================================================
 * mavlink_min.c  —  MAVLink v1 ve v2 çerçeve ayrıştırıcı
 *
 * CRC algoritması: CRC-16/MCRF4XX (MAVLink standardı)
 * Byte-by-byte state machine → DMA veya interrupt ile çalışır
 * ================================================================ */
#include "main.h"           /* STM32 HAL başlığını içerir         */
#include "mavlink_min.h"

/* ── CRC-16/MCRF4XX ──────────────────────────────────────── */

static uint16_t crc_acc(uint16_t crc, uint8_t b)
{
    b ^= (uint8_t)(crc & 0xFFu);
    b ^= (uint8_t)(b << 4);
    return (uint16_t)((crc >> 8) ^ ((uint16_t)b << 8)
                                 ^ ((uint16_t)b << 3)
                                 ^ ((uint16_t)b >> 4));
}

/* CRC_EXTRA: mesaj ID'sine göre sabit değer (MAVLink tanımından) */
static uint8_t crc_extra_for(uint32_t msgid)
{
    switch (msgid) {
        case  0: return  50;   /* HEARTBEAT         */
        case  1: return 124;   /* SYS_STATUS        */
        case 35: return 244;   /* RC_CHANNELS_RAW   */
        case 65: return 118;   /* RC_CHANNELS       */
        default: return   0;
    }
}

/* ── Parser durumları ────────────────────────────────────── */

typedef enum {
    S_IDLE = 0,
    /* MAVLink v1 */
    S_V1_LEN, S_V1_SEQ, S_V1_SYS, S_V1_COMP, S_V1_MSGID,
    S_V1_PAYLOAD, S_V1_CRC1, S_V1_CRC2,
    /* MAVLink v2 */
    S_V2_LEN, S_V2_INCOMPAT, S_V2_COMPAT,
    S_V2_SEQ, S_V2_SYS, S_V2_COMP,
    S_V2_MID0, S_V2_MID1, S_V2_MID2,
    S_V2_PAYLOAD, S_V2_CRC1, S_V2_CRC2,
} State_t;

#define MAX_PAYLOAD 255u

static struct {
    State_t  state;
    uint8_t  payload[MAX_PAYLOAD];
    uint8_t  len;
    uint8_t  idx;
    uint32_t msgid;
    uint8_t  sysid;    /* frame'in kaynak sistem ID'si */
    uint16_t crc_acc;
    uint16_t crc_rx;
} ps;   /* sıfırla başlatılır → S_IDLE */

/* ── Mesaj decoderları ───────────────────────────────────── */
/* Wire format: little-endian, MAVLink field-ordering kuralları */

static void decode_heartbeat(const uint8_t *p, MavData_t *out)
{
    /* custom_mode[0-3] type[4] autopilot[5] base_mode[6] sys_status[7] */
    out->base_mode     = p[6];
    out->system_status = p[7];
    out->last_hb_ms    = HAL_GetTick();
    out->initialised   = true;
}

static void decode_sys_status(const uint8_t *p, MavData_t *out)
{
    /* sensors_present[0-3] sensors_enabled[4-7] sensors_health[8-11]
     * load[12-13] voltage_battery[14-15] current_battery[16-17]
     * drop_rate_comm[18-19] errors_comm[20-21] errors_count1[22-23] */
    out->voltage_mv   = (uint16_t)(p[14] | ((uint16_t)p[15] << 8));
    out->errors_count = (uint16_t)(p[22] | ((uint16_t)p[23] << 8));
}

static void decode_rc_channels(const uint8_t *p, uint8_t len, MavData_t *out)
{
    /* time_boot_ms[0-3] chan1..chan18[4..39] chancount[40] rssi[41] */
    if (len < 42u) return;
    for (uint8_t i = 0; i < 18u; i++) {
        out->rc[i] = (uint16_t)(p[4u + i * 2u] | ((uint16_t)p[5u + i * 2u] << 8));
    }
    out->rc_count  = p[40];
    out->last_rc_ms = HAL_GetTick();
}

static void decode_rc_channels_raw(const uint8_t *p, uint8_t len, MavData_t *out)
{
    /* time_boot_ms[0-3] chan1..chan8[4..19] port[20] rssi[21] */
    if (len < 22u) return;
    for (uint8_t i = 0; i < 8u; i++) {
        out->rc[i] = (uint16_t)(p[4u + i * 2u] | ((uint16_t)p[5u + i * 2u] << 8));
    }
    out->rc_count  = 8u;
    out->last_rc_ms = HAL_GetTick();
}

static bool try_decode(MavData_t *out)
{
    /* sysID filtresi: beklenmedik kaynaktan gelen mesajları at.
     * MAVLINK_FC_SYSID = 0 ise filtre devre dışı (test modu).  */
#if MAVLINK_FC_SYSID != 0
    if (ps.sysid != (uint8_t)MAVLINK_FC_SYSID) return false;
#endif

    switch (ps.msgid) {
    case  0: decode_heartbeat(ps.payload, out);                    return true;
    case  1: decode_sys_status(ps.payload, out);                   return true;
    case 35: decode_rc_channels_raw(ps.payload, ps.len, out);      return true;
    case 65: decode_rc_channels(ps.payload, ps.len, out);          return true;
    default: return false;
    }
}

/* ── Ana parser ──────────────────────────────────────────── */

bool mavlink_feed_byte(uint8_t b, MavData_t *out)
{
    switch (ps.state) {

    /* ─── Başlangıç: STX baytını bekle ─────────────────── */
    case S_IDLE:
        if      (b == 0xFEu) ps.state = S_V1_LEN;
        else if (b == 0xFDu) ps.state = S_V2_LEN;
        return false;

    /* ─── MAVLink v1 ─────────────────────────────────── */
    case S_V1_LEN:
        ps.len     = b;
        ps.idx     = 0u;
        ps.crc_acc = crc_acc(0xFFFFu, b);
        ps.state   = S_V1_SEQ;
        return false;

    case S_V1_SEQ:
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = S_V1_SYS;
        return false;

    case S_V1_SYS:
        ps.sysid   = b;   /* kaynak sistem ID'sini sakla */
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = S_V1_COMP;
        return false;

    case S_V1_COMP:
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = S_V1_MSGID;
        return false;

    case S_V1_MSGID:
        ps.msgid   = b;
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = (ps.len > 0u) ? S_V1_PAYLOAD : S_V1_CRC1;
        return false;

    case S_V1_PAYLOAD:
        ps.payload[ps.idx++] = b;
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        if (ps.idx >= ps.len) ps.state = S_V1_CRC1;
        return false;

    case S_V1_CRC1:
        ps.crc_rx = b;
        ps.state  = S_V1_CRC2;
        return false;

    case S_V1_CRC2:
        ps.crc_rx |= ((uint16_t)b << 8);
        ps.crc_acc  = crc_acc(ps.crc_acc, crc_extra_for(ps.msgid));
        ps.state    = S_IDLE;
        if (ps.crc_rx != ps.crc_acc) return false;   /* CRC hatası → at */
        return try_decode(out);

    /* ─── MAVLink v2 ─────────────────────────────────── */
    case S_V2_LEN:
        ps.len     = b;
        ps.idx     = 0u;
        ps.crc_acc = crc_acc(0xFFFFu, b);
        ps.state   = S_V2_INCOMPAT;
        return false;

    case S_V2_INCOMPAT:
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = S_V2_COMPAT;
        return false;

    case S_V2_COMPAT:
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = S_V2_SEQ;
        return false;

    case S_V2_SEQ:
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = S_V2_SYS;
        return false;

    case S_V2_SYS:
        ps.sysid   = b;   /* kaynak sistem ID'sini sakla */
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = S_V2_COMP;
        return false;

    case S_V2_COMP:
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = S_V2_MID0;
        return false;

    case S_V2_MID0:
        ps.msgid   = b;
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = S_V2_MID1;
        return false;

    case S_V2_MID1:
        ps.msgid  |= ((uint32_t)b << 8);
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = S_V2_MID2;
        return false;

    case S_V2_MID2:
        ps.msgid  |= ((uint32_t)b << 16);
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        ps.state   = (ps.len > 0u) ? S_V2_PAYLOAD : S_V2_CRC1;
        return false;

    case S_V2_PAYLOAD:
        ps.payload[ps.idx++] = b;
        ps.crc_acc = crc_acc(ps.crc_acc, b);
        if (ps.idx >= ps.len) ps.state = S_V2_CRC1;
        return false;

    case S_V2_CRC1:
        ps.crc_rx = b;
        ps.state  = S_V2_CRC2;
        return false;

    case S_V2_CRC2:
        ps.crc_rx |= ((uint16_t)b << 8);
        ps.crc_acc  = crc_acc(ps.crc_acc, crc_extra_for(ps.msgid));
        ps.state    = S_IDLE;
        if (ps.crc_rx != ps.crc_acc) return false;
        return try_decode(out);

    default:
        ps.state = S_IDLE;
        return false;
    }
}
