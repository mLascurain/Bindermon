import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import TCGDex from '@tcgdex/sdk';

const tcgdex = new TCGDex('en');

export async function GET(req: Request, { params }: { params: Promise<{ api_set_id: string }> }) {
  const { api_set_id } = await params;

  try {
    const { data: collection } = await supabaseAdmin
      .from('collections')
      .select('id')
      .eq('api_set_id', api_set_id)
      .single();

    if (!collection) return NextResponse.json({ error: 'Colección no encontrada' }, { status: 404 });

    const setData = await tcgdex.fetch('sets', api_set_id);
    if (!setData || !setData.cards) throw new Error("No hay cartas");

    const fullCardsData = [];

    // Limitamos a las primeras 20 para probar y no saturar, 
    // luego puedes quitar el .slice() para traer todo el set
    const cardsToProcess = setData.cards; 

    for (const cardBrief of cardsToProcess) {
      // 1. Pedir el detalle de CADA carta para obtener rarity y variants
      const detail = await tcgdex.fetch('cards', cardBrief.id);
      
      if (detail) {
        // 2. Revisar qué variantes existen (normal, reverse, holo, etc.)
        const variantsFound = [];
        if (detail.variants?.normal) variantsFound.push('normal');
        if (detail.variants?.reverse) variantsFound.push('reverse');
        if (detail.variants?.holo) variantsFound.push('holo');

        if (variantsFound.length === 0) variantsFound.push('normal');

        // 3. Crear una entrada por cada variante
        for (const v of variantsFound) {
          fullCardsData.push({
            api_card_id: detail.id,
            collection_id: collection.id,
            name: detail.name,
            rarity: detail.rarity || 'Common',
            variant: v,
            image_small: `${detail.image}/low.webp`,
            image_large: `${detail.image}/high.webp`,
            price_raw: 0
          });
        }
      }
    }

    // 4. Upsert masivo de todas las variantes encontradas
    const { data: inserted, error: upsertError } = await supabaseAdmin
      .from('cards')
      .upsert(fullCardsData, { onConflict: 'api_card_id, variant' })
      .select();

    if (upsertError) throw upsertError;

    return NextResponse.json({ 
      success: true, 
      count: inserted?.length,
      message: `Se procesaron ${cardsToProcess.length} cartas base resultando en ${inserted?.length} variantes.` 
    });

  } catch (error: unknown) {
    console.error("Error en Deep Fetch:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}