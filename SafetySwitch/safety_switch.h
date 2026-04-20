/* ================================================================
 * safety_switch.h  —  Çift kanallı güvenlik anahtarı durum makinesi
 * ================================================================ */
#ifndef SAFETY_SWITCH_H
#define SAFETY_SWITCH_H

#include <stdint.h>
#include "mavlink_min.h"

typedef enum {
    SW_SAFE_OFF = 0,   /* Tüm çıkışlar LOW — varsayılan güvenli durum  */
    SW_ARMING,         /* Koşullar sağlandı, onay gecikmesi bekleniyor */
    SW_ACTIVE,         /* 4 anahtar ON — LED yanıyor                   */
    SW_FAULT,          /* MAVLink kesildi — kilitleme süresi doluyor   */
} SwitchState_t;

/*
 * Güç açıldıktan hemen sonra, GPIO init'ten SONRA çağır.
 * Tüm çıkışları LOW yapar, boot zamanlayıcısını başlatır.
 */
void sw_init(void);

/*
 * sw_init'ten sonra, ana döngüden ÖNCE bir kez çağır.
 * Her GPIO pinini tek tek test eder (SET → ODR doğrula → RESET → doğrula).
 * false dönerse donanım arızası var — FAULT içinde kal.
 *
 * Test sırasında relay bobinleri ~2ms kısaca enerjilendirilir;
 * MOSFET'ler kapalı olduğu için LED yanmaz (güvenli).
 */
bool sw_selftest(void);

/*
 * Ana döngüde ~10ms aralıklarla çağır.
 * mav: ISR tarafından güncellenen MAVLink verisi (salt okunur kullanım)
 * now_ms: HAL_GetTick()
 */
void sw_update(const MavData_t *mav, uint32_t now_ms);

/* Mevcut durumu döndürür (loglama / LED göstergesi için) */
SwitchState_t sw_state(void);

#endif /* SAFETY_SWITCH_H */
