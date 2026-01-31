import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import TCGDex from '@tcgdex/sdk';

const tcgdex = new TCGDex('en');

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id_api_series: string }> }
) {
  const { id_api_series } = await params;

  try {
    // 1. chequiar la db para buscar la serie
    const { data: seriesLocal, error: dbError } = await supabaseAdmin
      .from('series')
      .select('id, name, enabled')
      .eq('id_api_series', id_api_series)
      .single();

    if (dbError || !seriesLocal) {
      return NextResponse.json({ error: 'La serie que buscas no existe' }, { status: 404 });
    }

    if (!seriesLocal.enabled) {
      return NextResponse.json({ error: 'La serie que buscas esta deshabilitada' }, { status: 403 });
    }

    // 2. chequiar si tenemos las colecciones en la db
    const { data: cachedCollections } = await supabaseAdmin
      .from('collections')
      .select('*')
      .eq('id_series', seriesLocal.id);

    // si hay datos en la DB los devolvemos
    if (cachedCollections && cachedCollections.length > 0) {
      console.log(`>>> sirviendo '${seriesLocal.name}' desde la base de datos.`);
      return NextResponse.json({ 
        success: true, 
        source: 'local_db', 
        data: cachedCollections 
      });
    }

    // 3. llamar a la API si no hay datos en la DB
    console.log(`>>> la DB esta vacia. llamando a TCGDex para '${id_api_series}'...`);
    
    const serieData = await tcgdex.fetch('series', id_api_series);
    if (!serieData || !serieData.sets) {
      throw new Error('no se encontraron los sets en la API externa');
    }

    const toInsert = serieData.sets.map((set) => ({
      api_set_id: set.id,
      name: set.name,
      series: seriesLocal.name,
      total_cards: set.cardCount.total,
      image_logo: set.logo ? `${set.logo}.webp` : '',
      id_series: seriesLocal.id 
    }));

    // guardamos para la proxima vez
    const { data: inserted } = await supabaseAdmin
      .from('collections')
      .upsert(toInsert, { onConflict: 'api_set_id' })
      .select();

    return NextResponse.json({ 
      success: true, 
      source: 'external_api_cached', 
      data: inserted 
    });

  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// import { NextResponse } from 'next/server';
// import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
// import TCGDex from '@tcgdex/sdk';

// const tcgdex = new TCGDex('en');

// export async function GET(
//   req: Request,
//   { params }: { params: Promise<{ id_api_series: string }> }
// ) {
//   const { id_api_series } = await params;

//   try {
//     // 1. Validar la serie en la DB Local
//     const { data: seriesLocal, error: dbError } = await supabaseAdmin
//       .from('series')
//       .select('id, name, enabled')
//       .eq('id_api_series', id_api_series)
//       .single();

//     // Si no existe, o si esta deshabilitada, le devolvemos un errorphite
//     if (dbError || !seriesLocal) {
//       return NextResponse.json(
//         { error: `La serie '${id_api_series}' no está registrada en nuestro sistema.` }, 
//         { status: 404 }
//       );
//     }

//     if (!seriesLocal.enabled) {
//       return NextResponse.json(
//         { error: `La serie '${seriesLocal.name}' no está habilitada actualmente.` }, 
//         { status: 403 } // Forbidden
//       );
//     }

//     console.log(`Verificación exitosa. Habilitando descarga para: ${seriesLocal.name}`);

//     // 2. Traer sets de TCGDex solo si la validacion fue exitosa
//     const serieData = await tcgdex.fetch('series', id_api_series);

//     if (!serieData || !serieData.sets) {
//       return NextResponse.json(
//         { error: 'No se encontraron colecciones en el proveedor externo' }, 
//         { status: 404 }
//       );
//     }

//     // 3. Mapear colecciones
//     const toInsert = serieData.sets.map((set) => ({
//       api_set_id: set.id,
//       name: set.name,
//       series: seriesLocal.name,
//       total_cards: set.cardCount.total,
//       image_logo: set.logo ? `${set.logo}.webp` : '', 
//       id_series: seriesLocal.id 
//     }));

//     // 4. Upsert en la tabla 'collections'
//     const { data: inserted, error: upsertError } = await supabaseAdmin
//       .from('collections')
//       .upsert(toInsert, { onConflict: 'api_set_id' })
//       .select();

//     if (upsertError) {
//       console.error("Error al actualizar colecciones:", upsertError);
//       throw upsertError;
//     }

//     return NextResponse.json({ 
//       success: true, 
//       message: `Colecciones de '${seriesLocal.name}' actualizadas correctamente.`,
//       count: inserted?.length,
//       data: inserted?.map(s => ({ id: s.api_set_id, name: s.name }))
//     });

//   } catch (error: unknown) {
//     console.error("Critical API Error:", error);
//     return NextResponse.json(
//       { error: (error as Error).message }, 
//       { status: 500 }
//     );
//   }
// }
