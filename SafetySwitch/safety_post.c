/* ================================================================
 * safety_post.c  —  Power-on bütünlük testleri implementasyonu
 * ================================================================ */
#include "main.h"
#include "safety_post.h"

/* ── Yığın (Stack) Canary ────────────────────────────────────────
 *
 * STM32CubeIDE linker script'i bu sembolleri tanımlar:
 *   _estack         = SRAM'ın en üst adresi (MSP başlangıcı)
 *   _Min_Stack_Size = CubeMX Minimum Heap Size alanındaki değer
 *                     (Linker → Minimum Stack Size ile NOT aynı)
 *
 * Yığın tabanı = _estack - _Min_Stack_Size
 * Canary bu adrese yazılır. Yığın büyüdükçe bu adrese yaklaşır;
 * taşarsa canary üzerine yazılır.
 *
 * CubeMX ayarı: Project Manager → Linker Settings
 *               → Minimum Stack Size: 0x400 (en az)
 * ──────────────────────────────────────────────────────────────── */
#define CANARY_WORD     0xDEADBEEFu
#define CANARY_COUNT    4u

/* Linker sembolleri — CubeMX/STM32CubeIDE bunları otomatik üretir */
extern uint32_t _estack;
extern uint32_t _Min_Stack_Size;

static volatile uint32_t *get_canary_addr(void)
{
    uint32_t stack_bottom = (uint32_t)&_estack - (uint32_t)&_Min_Stack_Size;
    /* İlk 16 byte'ı canary için ayır */
    return (volatile uint32_t *)stack_bottom;
}

void post_canary_init(void)
{
    volatile uint32_t *p = get_canary_addr();
    for (uint32_t i = 0u; i < CANARY_COUNT; i++) {
        p[i] = CANARY_WORD;
    }
    /* Veri hafızaya yazıldığından emin ol (compiler optimizasyon önleme) */
    __DSB();
}

bool post_canary_ok(void)
{
    volatile const uint32_t *p = get_canary_addr();
    for (uint32_t i = 0u; i < CANARY_COUNT; i++) {
        if (p[i] != CANARY_WORD) return false;
    }
    return true;
}

/* ── Flash CRC Bütünlük Kontrolü ────────────────────────────────
 *
 * KULLANIM ADIMLARI:
 *
 * Adım 1: CubeMX → CRC → Activated: Yes, Default Init State: Enabled
 *         Polynomial: 0x04C11DB7 (CRC-32), Data Width: 32-bit
 *
 * Adım 2: STM32CubeIDE → Properties → C/C++ Build → Settings
 *         → Post-build steps:
 *         arm-none-eabi-objcopy -O binary ${BuildArtifactFileName} fw.bin
 *         python3 ../Scripts/compute_crc.py fw.bin
 *
 * compute_crc.py örneği:
 *   import struct, sys, zlib
 *   data = open(sys.argv[1],'rb').read()
 *   # 4-byte hizala
 *   data += b'\xff' * ((-len(data)) % 4)
 *   crc = 0
 *   for i in range(0, len(data), 4):
 *       word = struct.unpack('<I', data[i:i+4])[0]
 *       # STM32 CRC32 hesabı burada yapılır
 *   print(f"#define EXPECTED_FLASH_CRC 0x{crc:08X}u")
 *
 * Adım 3: Üretilen değeri aşağıdaki EXPECTED_FLASH_CRC'ye yaz.
 *         0 bırakırsan kontrol atlanır (geliştirme modu).
 * ──────────────────────────────────────────────────────────────── */
#define FLASH_ORIGIN        0x08000000u
#define FLASH_CHECK_WORDS   (16384u)         /* 64KB = 16K × 4 byte word  */
#define EXPECTED_FLASH_CRC  0x00000000u      /* ← Post-build script yazar */

extern CRC_HandleTypeDef hcrc;

bool post_flash_crc_ok(void)
{
#if EXPECTED_FLASH_CRC == 0x00000000u
    /* Beklenen CRC henüz ayarlanmamış — geliştirme modunda geç */
    return true;
#else
    uint32_t computed = HAL_CRC_Calculate(
        &hcrc,
        (uint32_t *)FLASH_ORIGIN,
        FLASH_CHECK_WORDS
    );
    return (computed == EXPECTED_FLASH_CRC);
#endif
}
