import { NextResponse } from 'next/server';
import TCGDex from '@tcgdex/sdk';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';

const tcgdex = new TCGDex('en');

export async function GET() {
  try {
    // 1. traaigo lo que tiene la DB
    const { data: localSeries } = await supabaseAdmin
      .from('series')
      .select('*')
      .order('name', { ascending: true });

    // si hay datos en la DB, retornamos eso
    if (localSeries && localSeries.length > 0) {
      console.log(">>> Series servidas desde DB local.");
      return NextResponse.json({ success: true, source: 'database', data: localSeries });
    }

    // 2. si la DB esta pelada, llamamos a la API
    console.log(">>> DB vacía. Sincronizando series desde TCGDex...");
    const allSeries = await tcgdex.fetch('series');

    if (!allSeries) throw new Error("API Indisponible.");

    const toInsert = allSeries.map((serie) => ({
      id_api_series: serie.id,
      name: serie.name,
      enabled: false, 
      image_logo: serie.logo ? `${serie.logo}.webp` : ''
    }));

    const { data: inserted, error: upsertError } = await supabaseAdmin
      .from('series')
      .upsert(toInsert, { onConflict: 'id_api_series' })
      .select();

    if (upsertError) throw upsertError;

    return NextResponse.json({ success: true, source: 'api', data: inserted });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
// import { NextResponse } from 'next/server';
// import TCGDex from '@tcgdex/sdk';
// import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';

// const tcgdex = new TCGDex('en');

// export async function GET() {
//   try {
//     const { data: localSeries } = await supabaseAdmin
//       .from('series')
//       .select('*');

//     const allSeries = await tcgdex.fetch('series');

//     if (!allSeries) {
//       if (localSeries && localSeries.length > 0) return NextResponse.json({ success: true, data: localSeries, cached: true });
//       throw new Error("API Indisponible y no hay datos locales.");
//     }

//     const toInsert = allSeries.map((serie) => ({
//       id_api_series: serie.id,
//       name: serie.name,
//       image_logo: serie.logo ? `${serie.logo}.webp` : ''
//     }));

//     const { data: inserted, error: upsertError } = await supabaseAdmin
//       .from('series')
//       .upsert(toInsert, { onConflict: 'id_api_series' })
//       .select();

//     if (upsertError) throw upsertError;

//     return NextResponse.json({ success: true, count: inserted?.length, data: inserted });
//   } catch (error: unknown) {
//     const message = error instanceof Error ? error.message : 'An unknown error occurred';
//     return NextResponse.json({ error: message }, { status: 500 });
//   }
// }