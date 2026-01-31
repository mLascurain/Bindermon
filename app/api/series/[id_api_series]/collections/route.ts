import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import TCGDex from '@tcgdex/sdk';

const tcgdex = new TCGDex('en');

export async function GET() {
  const apiSerieId = 'sv';

  try {
    // 1. BUSCAR la serie primero
    let { data: seriesLocal } = await supabaseAdmin
      .from('series')
      .select('*')
      .eq('id_api_series', apiSerieId)
      .single();

    // 2. Si no existe, la creamos (con los datos de la imagen que ya tienes en la captura)
    if (!seriesLocal) {
      const { data: newSeries, error: insertError } = await supabaseAdmin
        .from('series')
        .insert({ 
          id_api_series: apiSerieId, 
          name: 'Scarlet & Violet', 
          enabled: true,
          // Agregamos los logos que veo en tu captura para que no queden vacíos
          image_logo: 'https://assets.tcgdex.net/en/sv/sv01/logo',
          image_symbol: 'https://assets.tcgdex.net/en/sv/sv01/logo'
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error al insertar serie:", insertError);
        throw insertError;
      }
      seriesLocal = newSeries;
    }

    console.log(`Serie lista: ${seriesLocal.name} (ID: ${seriesLocal.id})`);

    // 3. Traer sets de TCGDex
    const serieData = await tcgdex.fetch('series', apiSerieId);

    if (!serieData || !serieData.sets) {
      return NextResponse.json({ error: 'No se encontraron sets' }, { status: 404 });
    }

    // 4. Mapear colecciones
    const toInsert = serieData.sets.map((set) => ({
      api_set_id: set.id,
      name: set.name,
      series: seriesLocal.name,
      total_cards: set.cardCount.total,
      // Si no hay logo o symbol, ponemos un string vacío o una URL por defecto
      image_logo: set.logo ? `${set.logo}.png` : '', 
      image_symbol: set.symbol ? `${set.symbol}.png` : '',
      id_series: seriesLocal.id 
    }));

    // 5. Poblar las colecciones
    const { data: inserted, error: upsertError } = await supabaseAdmin
      .from('collections')
      .upsert(toInsert, { onConflict: 'api_set_id' })
      .select();

    if (upsertError) {
      console.error("Error en upsert de colecciones:", upsertError);
      throw upsertError;
    }

    return NextResponse.json({ 
      success: true, 
      count: inserted?.length,
      sets: inserted?.map(s => s.name)
    });

  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}