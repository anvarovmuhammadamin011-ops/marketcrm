import { db } from './database'

/**
 * Hujjat raqamlari hisoblagichlari (sale_no, purchase_no, ...).
 * Tranzaksiya ichida chaqirilsa ham to'g'ri ishlaydi — bitta jadval bilan ishlaydi.
 */
export async function nextDocNo(key: string): Promise<string> {
  return db.transaction('rw', db.counters, async () => {
    let counter = await db.counters.where('key').equals(key).first()

    // Hisoblagich hali yaratilmagan bo'lsa (seed boshqa sabab bilan o'tkazilgan)
    if (!counter) {
      const id = await db.counters.add({ key, value: 0 })
      counter = { id: id as number, key, value: 0 }
    }

    const next = counter.value + 1
    await db.counters.update(counter.id!, { value: next })
    return String(next).padStart(6, '0')
  })
}
