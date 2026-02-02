import { NextResponse } from 'next/server';
import TCGDex from '@tcgdex/sdk';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';

const tcgdex = new TCGDex('en');
const ENABLED_SERIES = ['sv', 'me'];

export async function GET() {
  try {
    const { data: localSeries, error: fetchError } = await supabaseAdmin
      .from('series')
      .select('id_api_series');

    if (fetchError) throw fetchError;

    const existingIds = new Set(localSeries?.map((s) => s.id_api_series));

    const allSeries = await tcgdex.fetch('series');
    if (!allSeries || allSeries.length === 0) throw new Error('No se pudo obtener series desde la API.');

    const newSeries = allSeries.filter((serie) => !existingIds.has(serie.id));

    if (newSeries.length === 0) {
      console.log('no hay nuevas series para insertar.');
      const { data: fullSeries } = await supabaseAdmin
        .from('series')
        .select('*')
        .order('name', { ascending: true });

      return NextResponse.json({ success: true, source: 'database', data: fullSeries });
    }

    const toInsert = newSeries.map((serie) => ({
      id_api_series: serie.id,
      name: serie.name,
      enabled: ENABLED_SERIES.includes(serie.id),
      image_logo: serie.logo ? `${serie.logo}.webp` : '',
    }));

    const { data: inserted, error: upsertError } = await supabaseAdmin
      .from('series')
      .upsert(toInsert, { onConflict: 'id_api_series' })
      .select();

    if (upsertError) throw upsertError;

    console.log(`${inserted.length} nuevas series insertadas.`);
    const { data: updatedSeries } = await supabaseAdmin
      .from('series')
      .select('*')
      .order('name', { ascending: true });

    return NextResponse.json({ success: true, source: 'api+db', data: updatedSeries });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('error al sincronizar series:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}