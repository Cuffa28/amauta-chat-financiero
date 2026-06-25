import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODELO = "claude-sonnet-4-6";

const TOOLS = [
  {
    name: "buscar_serie",
    description:
      "Busca una serie histórica YA guardada en la base de datos de Amauta. " +
      "Usá esto primero. Si no está, usá solicitar_serie.",
    input_schema: {
      type: "object",
      properties: {
        ric: { type: "string", description: "Código RIC, ej AAPL.O, .SPX, ARS=" },
        campo: { type: "string", description: "CLOSE, OPEN, HIGH, LOW", default: "CLOSE" },
      },
      required: ["ric"],
    },
  },
  {
    name: "solicitar_serie",
    description:
      "Encola un pedido para que el worker local baje una serie desde Reuters Eikon " +
      "cuando NO está en la base. Devolvé el RIC correcto y un rango de fechas.",
    input_schema: {
      type: "object",
      properties: {
        ric: { type: "string" },
        campo: { type: "string", default: "CLOSE" },
        fecha_inicio: { type: "string", description: "YYYY-MM-DD" },
        fecha_fin: { type: "string", description: "YYYY-MM-DD" },
        descripcion: { type: "string", description: "Nombre legible, ej 'Apple Inc'" },
      },
      required: ["ric"],
    },
  },
  {
    name: "obtener_serie_bls",
    description:
      "Trae una serie macro de EE.UU. del Bureau of Labor Statistics (BLS) por su series ID. " +
      "Usala para datos de EE.UU.: inflación/IPC (CPI), desempleo, empleo, ganancias, PPI. " +
      "Funciona directo (no usa el worker). Series comunes: " +
      "CPI-U inflación (NSA)=CUUR0000SA0; CPI-U (SA)=CUSR0000SA0; CPI core (sin alim/energía)=CUUR0000SA0L1E; " +
      "Tasa de desempleo=LNS14000000; Empleo no agrícola (miles)=CES0000000001; " +
      "Participación laboral=LNS11300000; Ganancias horarias privadas=CES0500000003; PPI demanda final=WPUFD4.",
    input_schema: {
      type: "object",
      properties: {
        series_id: { type: "string", description: "BLS series ID, ej CUUR0000SA0" },
        anio_inicio: { type: "integer", description: "Año inicial, ej 2020" },
        anio_fin: { type: "integer", description: "Año final, ej 2025" },
        descripcion: { type: "string", description: "Nombre legible, ej 'IPC EE.UU. (CPI-U)'" },
      },
      required: ["series_id"],
    },
  },
  {
    name: "obtener_serie_fred",
    description:
      "Trae una serie de la Reserva Federal de EE.UU. (FRED, St. Louis Fed) por su series ID. " +
      "Cobertura enorme de macro de EE.UU. y global. Funciona directo en la nube. Series comunes: " +
      "PBI real EE.UU.=GDPC1; CPI=CPIAUCSL; desempleo=UNRATE; tasa Fed=FEDFUNDS; " +
      "Treasury 10 años=DGS10; Treasury 2 años=DGS2; USD/EUR=DEXUSEU; precio petróleo WTI=DCOILWTICO; " +
      "M2=M2SL; expectativas inflación 5y=T5YIE.",
    input_schema: {
      type: "object",
      properties: {
        series_id: { type: "string", description: "FRED series ID, ej UNRATE" },
        anio_inicio: { type: "integer" },
        anio_fin: { type: "integer" },
        descripcion: { type: "string", description: "Nombre legible, ej 'Tasa de fondos federales'" },
      },
      required: ["series_id"],
    },
  },
  {
    name: "obtener_serie_bea",
    description:
      "Trae una serie del Bureau of Economic Analysis (BEA) de EE.UU. (cuentas nacionales, PBI, consumo, ingreso). " +
      "Requiere dataset (default NIPA), table_name y line_number (la línea 1 suele ser el agregado principal). " +
      "Tablas comunes (NIPA): PBI real nivel=T10106 línea 1 (freq Q); PBI nominal=T10105 línea 1; " +
      "PBI variación % anualizada=T10101 línea 1; Consumo personal real=T10106 línea 2; Ingreso personal=T20100 línea 1. " +
      "OJO: gran parte de BEA también está en FRED con IDs más simples; si dudás, preferí FRED.",
    input_schema: {
      type: "object",
      properties: {
        table_name: { type: "string", description: "Tabla BEA, ej T10106" },
        line_number: { type: "integer", description: "Número de línea de la tabla (default 1)" },
        frequency: { type: "string", description: "A (anual), Q (trimestral) o M (mensual). Default Q" },
        dataset: { type: "string", description: "Dataset BEA, default NIPA" },
        descripcion: { type: "string", description: "Nombre legible, ej 'PBI real EE.UU.'" },
      },
      required: ["table_name"],
    },
  },
  {
    name: "obtener_serie_bcra",
    description:
      "Trae una serie del Banco Central de la República Argentina (BCRA) por su ID de variable. " +
      "Usala para macro/monetario de Argentina. Funciona directo en la nube. IDs comunes: " +
      "Reservas internacionales=1; Tipo de cambio minorista=4; Tipo de cambio mayorista=5; " +
      "Base monetaria=15; Inflación mensual %=27; Inflación interanual %=28; Tasa de política monetaria=160.",
    input_schema: {
      type: "object",
      properties: {
        id_variable: { type: "integer", description: "ID de variable BCRA, ej 5" },
        desde: { type: "string", description: "YYYY-MM-DD" },
        hasta: { type: "string", description: "YYYY-MM-DD" },
        descripcion: { type: "string", description: "Nombre legible, ej 'Dólar mayorista BCRA'" },
      },
      required: ["id_variable"],
    },
  },
];

const HOY = new Date().toISOString().slice(0, 10);
const SYSTEM = `Sos un analista financiero de Amauta Inversiones Financieras. Ayudás al equipo a obtener series históricas de mercado.
Flujo: 1) deducí el RIC correcto del instrumento que pide el usuario; 2) llamá buscar_serie; 3) si no está en la base, llamá solicitar_serie para encolar la descarga desde Reuters y avisá que estará lista en unos segundos.
RICs — cómo deducirlos:
- Acciones EE.UU.: ticker + mercado (Apple=AAPL.O, Microsoft=MSFT.O); índices con punto (S&P500=.SPX, Nasdaq=.IXIC). FX/commodities con "=" (euro=EUR=, real=BRL=, oro=XAU=, WTI=CLc1).
- ARGENTINA (clave — antes fallaba): patrón -> acciones BYMA = TICKER.BA (GGAL.BA, YPFD.BA, PAMP.BA, TGSU2.BA); bonos/letras en PESOS = TICKER=BCBA; bonos en USD "cable"/exterior (hard-dollar) = TICKER + "D=".
  · Soberanos USD: Globales ley NY = GD29, GD30, GD35, GD38, GD41, GD46. Bonares ley local = AL29, AL30, AL35, AL41, AE38.
    -> "en cable"/"en dólares"/"hard dollar"/exterior = sufijo D= (ej: GD30D=, AL30D=). "en pesos"/BYMA = =BCBA (ej: GD30=BCBA). Si dice "Globales en cable" sin aclarar, usá el D=.
  · Dólar oficial mayorista = ARS=BCBA. Dólar MEP/blue: NO tienen RIC directo en Reuters (el MEP se calcula AL30D= / AL30=BCBA); si lo piden, avisá que conviene traerlo del BCRA o calcularlo, no inventes un RIC.
  · Bonos CER: TX26=BCBA, TX28=BCBA, TX30=BCBA, DICP=BCBA, PARP=BCBA. Coeficiente CER = ARGTCI=ECI.
  · Merval (índice) = .MERV. Caución bursátil 1 día = ARCAUBD1=BCBA. Badlar privada = ARBDLR=ECI.
  · Lecaps/Letras: el RIC cambia con cada licitación (ej S30J5, S29S6); si no estás seguro del ticker vigente, decílo en vez de adivinar.
- REGLA DE ORO: si no estás seguro del RIC de un instrumento argentino, decí explícitamente qué RIC vas a usar (y por qué) para que el usuario lo confirme. Nunca inventes un RIC a ciegas.
FUENTES (elegí la herramienta correcta):
- Precios de mercado, acciones, índices, FX, commodities, bonos -> Reuters (buscar_serie / solicitar_serie).
- Empleo, inflación CPI, ganancias, PPI de EE.UU. (Bureau of Labor Statistics) -> obtener_serie_bls.
- Macro de EE.UU./global y tasas (PBI, tasa Fed, Treasuries, M2, petróleo) -> obtener_serie_fred (FRED, Reserva Federal).
- Cuentas nacionales de EE.UU. (PBI, consumo, ingreso) del Bureau of Economic Analysis -> obtener_serie_bea. Si la serie existe en FRED, preferí FRED (más simple).
- Macro y monetario de Argentina (reservas, dólar oficial/mayorista/minorista, base monetaria, inflación INDEC vía BCRA, tasa de política) -> obtener_serie_bcra (BCRA).
- Liquidación de divisas del agro / exportaciones del complejo cerealero-oleaginoso (CIARA-CEC) -> ya está en la base como serie mensual en USD: usá buscar_serie con ric "CIARA-LIQ" y campo "USD".
Si dudás entre BLS y FRED para EE.UU., cualquiera sirve; preferí FRED para tasas/PBI y BLS para empleo/CPI.
Si el usuario no da fechas, usá el último año para Reuters y los últimos 5-10 años para fuentes macro (hoy es ${HOY}).

ESTILO DE RESPUESTA (importante): respondé en español, de forma BREVE y conversacional (1 a 3 frases), tratando de "usted". El gráfico, la tabla y los datos se muestran automáticamente en el panel de al lado, así que NO armes tablas markdown ni listes los valores: solo comentá lo esencial (qué instrumento, último valor y la variación del período) en lenguaje natural. Si encolaste un pedido a Reuters, avisá que el gráfico aparecerá solo en unos segundos (NO digas "vuelva a consultar"). Podés cerrar ofreciendo comparar con otra serie o cambiar el período.`;

// Lee TODAS las observaciones paginando (Supabase corta en 1000 filas por consulta).
async function leerObservaciones(sb, serieId) {
  let todas = [], desde = 0;
  for (;;) {
    const { data } = await sb.from("observaciones").select("fecha,valor")
      .eq("serie_id", serieId).order("fecha").range(desde, desde + 999);
    if (!data || data.length === 0) break;
    todas = todas.concat(data);
    if (data.length < 1000) break;
    desde += 1000;
  }
  return todas;
}

async function buscarSerie(sb, ric, campo, seriesData) {
  const { data: serie } = await sb
    .from("series").select("id,descripcion,fuente")
    .eq("ric", ric).eq("campo", campo).limit(1);
  if (!serie || serie.length === 0) return `No hay datos de ${ric} (${campo}) en la base todavía.`;

  const obs = await leerObservaciones(sb, serie[0].id);
  if (!obs || obs.length === 0) return `La serie ${ric} existe pero no tiene observaciones.`;

  seriesData.push({ ric, campo, descripcion: serie[0].descripcion, fuente: serie[0].fuente, data: obs });
  const v0 = obs[0].valor, v1 = obs[obs.length - 1].valor;
  const varPct = v0 ? (((v1 / v0) - 1) * 100).toFixed(2) : "0";
  return `${ric} (${campo}): ${obs.length} obs, de ${obs[0].fecha} a ${obs[obs.length - 1].fecha}. ` +
         `Primer ${v0}, último ${v1}, variación ${varPct}%.`;
}

async function solicitarSerie(sb, input, solicitudes) {
  const { data, error } = await sb.from("solicitudes").insert({
    ric: input.ric,
    campo: input.campo || "CLOSE",
    fecha_inicio: input.fecha_inicio || null,
    fecha_fin: input.fecha_fin || null,
    descripcion: input.descripcion || null,
  }).select("id").single();
  if (error) return `No se pudo encolar: ${error.message}`;
  solicitudes.push({ id: data.id, ric: input.ric, campo: input.campo || "CLOSE" });
  return `Pedido encolado para ${input.ric}. Se está bajando de Reuters y el gráfico aparecerá solo en el panel en unos segundos.`;
}

// Convierte año + período BLS (M01..M12 / Q01..Q04 / A01) a fecha YYYY-MM-01.
function periodoBLSaFecha(year, period) {
  if (period >= "M01" && period <= "M12") return `${year}-${period.slice(1)}-01`;
  const trim = { Q01: "01", Q02: "04", Q03: "07", Q04: "10", A01: "01" };
  if (trim[period]) return `${year}-${trim[period]}-01`;
  return null; // M13 (promedio anual), Q05, S0x -> se ignoran
}

async function obtenerBLS(seriesId, anioInicio, anioFin) {
  const body = { seriesid: [seriesId], startyear: String(anioInicio), endyear: String(anioFin) };
  if (process.env.BLS_API_KEY) body.registrationkey = process.env.BLS_API_KEY;
  const res = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.status !== "REQUEST_SUCCEEDED" || !json.Results?.series?.[0]?.data?.length) {
    throw new Error((json.message && json.message.join("; ")) || "BLS no devolvió datos");
  }
  const puntos = [];
  for (const d of json.Results.series[0].data) {
    const fecha = periodoBLSaFecha(d.year, d.period);
    const valor = parseFloat(d.value);
    if (fecha && !isNaN(valor)) puntos.push({ fecha, valor });
  }
  puntos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return puntos;
}

async function guardarSerieSupabase(sb, ric, campo, fuente, descripcion, puntos) {
  const { data: s } = await sb.from("series")
    .upsert({ ric, campo, fuente, descripcion }, { onConflict: "ric,campo,fuente" })
    .select("id").single();
  const filas = puntos.map((p) => ({ serie_id: s.id, fecha: p.fecha, valor: p.valor }));
  for (let i = 0; i < filas.length; i += 1000) {
    await sb.from("observaciones").upsert(filas.slice(i, i + 1000), { onConflict: "serie_id,fecha" });
  }
}

async function obtenerSerieBLS(sb, input, seriesData) {
  const hoy = new Date().getFullYear();
  const fin = input.anio_fin || hoy;
  const inicio = input.anio_inicio || hoy - 5;
  const puntos = await obtenerBLS(input.series_id, inicio, fin);
  if (puntos.length === 0) return `BLS no devolvió datos para ${input.series_id}.`;
  const desc = input.descripcion || input.series_id;
  await guardarSerieSupabase(sb, input.series_id, "VALUE", "bls", desc, puntos);
  seriesData.push({ ric: input.series_id, campo: "VALUE", descripcion: desc, fuente: "bls", data: puntos });
  const v0 = puntos[0].valor, v1 = puntos[puntos.length - 1].valor;
  const varPct = v0 ? (((v1 / v0) - 1) * 100).toFixed(2) : "0";
  return `${input.series_id} (BLS, ${desc}): ${puntos.length} obs, de ${puntos[0].fecha} a ${puntos[puntos.length - 1].fecha}. ` +
         `Primer ${v0}, último ${v1}, variación ${varPct}%.`;
}

// ---------- FRED (Reserva Federal / St. Louis Fed) ----------
async function obtenerSerieFRED(sb, input, seriesData) {
  if (!process.env.FRED_API_KEY) return "Falta configurar FRED_API_KEY. Pedile al admin que la cargue.";
  const hoy = new Date().getFullYear();
  const fin = input.anio_fin || hoy;
  const inicio = input.anio_inicio || hoy - 10;
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(input.series_id)}` +
    `&api_key=${process.env.FRED_API_KEY}&file_type=json` +
    `&observation_start=${inicio}-01-01&observation_end=${fin}-12-31`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.observations?.length) throw new Error(json.error_message || "FRED no devolvió datos");
  const puntos = json.observations
    .filter((o) => o.value !== ".")
    .map((o) => ({ fecha: o.date, valor: parseFloat(o.value) }))
    .filter((p) => !isNaN(p.valor));
  if (puntos.length === 0) return `FRED no devolvió datos para ${input.series_id}.`;
  const desc = input.descripcion || input.series_id;
  await guardarSerieSupabase(sb, input.series_id, "VALUE", "fred", desc, puntos);
  seriesData.push({ ric: input.series_id, campo: "VALUE", descripcion: desc, fuente: "fred", data: puntos });
  const v0 = puntos[0].valor, v1 = puntos[puntos.length - 1].valor;
  const varPct = v0 ? (((v1 / v0) - 1) * 100).toFixed(2) : "0";
  return `${input.series_id} (FRED, ${desc}): ${puntos.length} obs, de ${puntos[0].fecha} a ${puntos[puntos.length - 1].fecha}. Último ${v1}, variación ${varPct}%.`;
}

// ---------- BEA (Bureau of Economic Analysis) ----------
function periodoBEAaFecha(tp) {
  if (/^\d{4}$/.test(tp)) return `${tp}-01-01`;
  const q = tp.match(/^(\d{4})Q([1-4])$/);
  if (q) return `${q[1]}-${String((+q[2] - 1) * 3 + 1).padStart(2, "0")}-01`;
  const m = tp.match(/^(\d{4})M(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-01`;
  return null;
}

async function obtenerSerieBEA(sb, input, seriesData) {
  if (!process.env.BEA_API_KEY) return "Falta configurar BEA_API_KEY. Pedile al admin que la cargue.";
  const dataset = input.dataset || "NIPA";
  const freq = input.frequency || "Q";
  const ln = input.line_number != null ? String(input.line_number) : "1";
  const url = `https://apps.bea.gov/api/data?UserID=${process.env.BEA_API_KEY}&method=GetData` +
    `&datasetname=${dataset}&TableName=${encodeURIComponent(input.table_name)}&Frequency=${freq}&Year=ALL&ResultFormat=JSON`;
  const res = await fetch(url);
  const json = await res.json();
  const data = json?.BEAAPI?.Results?.Data;
  if (!data?.length) {
    const err = json?.BEAAPI?.Error?.APIErrorDescription || json?.BEAAPI?.Results?.Error;
    throw new Error(typeof err === "string" ? err : (err ? JSON.stringify(err) : "BEA no devolvió datos"));
  }
  const filtrado = data.filter((d) => String(d.LineNumber) === ln);
  const usar = filtrado.length ? filtrado : data;
  const desc = input.descripcion || usar[0]?.LineDescription || `${dataset} ${input.table_name}`;
  const puntos = [];
  for (const d of usar) {
    const fecha = periodoBEAaFecha(d.TimePeriod);
    const valor = parseFloat(String(d.DataValue).replace(/,/g, ""));
    if (fecha && !isNaN(valor)) puntos.push({ fecha, valor });
  }
  puntos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (puntos.length === 0) return `BEA no devolvió datos numéricos para ${input.table_name} línea ${ln}.`;
  const ric = `BEA-${dataset}-${input.table_name}-L${ln}`;
  await guardarSerieSupabase(sb, ric, "VALUE", "bea", desc, puntos);
  seriesData.push({ ric, campo: "VALUE", descripcion: desc, fuente: "bea", data: puntos });
  const v0 = puntos[0].valor, v1 = puntos[puntos.length - 1].valor;
  const varPct = v0 ? (((v1 / v0) - 1) * 100).toFixed(2) : "0";
  return `${ric} (${desc}): ${puntos.length} obs, de ${puntos[0].fecha} a ${puntos[puntos.length - 1].fecha}. Último ${v1}, variación ${varPct}%.`;
}

// ---------- BCRA (Banco Central Argentina) ----------
async function obtenerSerieBCRA(sb, input, seriesData) {
  const id = input.id_variable;
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = input.desde || `${new Date().getFullYear() - 2}-01-01`;
  const hasta = input.hasta || hoy;
  const url = `https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${id}?desde=${desde}&hasta=${hasta}&limit=3000`;
  const res = await fetch(url);
  const json = await res.json();
  const detalle = json.results?.detalle || json.results?.[0]?.detalle;
  if (!detalle?.length) throw new Error((json.errorMessages && json.errorMessages.join("; ")) || "BCRA no devolvió datos");
  const puntos = detalle
    .map((d) => ({ fecha: d.fecha, valor: parseFloat(d.valor) }))
    .filter((p) => !isNaN(p.valor))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const desc = input.descripcion || `BCRA variable ${id}`;
  await guardarSerieSupabase(sb, `BCRA-${id}`, "VALUE", "bcra", desc, puntos);
  seriesData.push({ ric: `BCRA-${id}`, campo: "VALUE", descripcion: desc, fuente: "bcra", data: puntos });
  const v0 = puntos[0].valor, v1 = puntos[puntos.length - 1].valor;
  const varPct = v0 ? (((v1 / v0) - 1) * 100).toFixed(2) : "0";
  return `BCRA-${id} (${desc}): ${puntos.length} obs, de ${puntos[0].fecha} a ${puntos[puntos.length - 1].fecha}. Último ${v1}, variación ${varPct}%.`;
}

export async function POST(req) {
  try {
    const { messages } = await req.json();
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const sb = supabaseAdmin();

    const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
    const seriesData = [];
    const solicitudes = [];

    for (let i = 0; i < 6; i++) {
      const resp = await anthropic.messages.create({
        model: MODELO,
        max_tokens: 1500,
        system: SYSTEM,
        tools: TOOLS,
        messages: apiMessages,
      });

      if (resp.stop_reason === "tool_use") {
        apiMessages.push({ role: "assistant", content: resp.content });
        const results = [];
        for (const block of resp.content) {
          if (block.type !== "tool_use") continue;
          let out;
          if (block.name === "buscar_serie") {
            out = await buscarSerie(sb, block.input.ric, block.input.campo || "CLOSE", seriesData);
          } else if (block.name === "solicitar_serie") {
            out = await solicitarSerie(sb, block.input, solicitudes);
          } else if (block.name === "obtener_serie_bls") {
            try {
              out = await obtenerSerieBLS(sb, block.input, seriesData);
            } catch (e) {
              out = `Error consultando BLS: ${e.message}`;
            }
          } else if (block.name === "obtener_serie_fred") {
            try {
              out = await obtenerSerieFRED(sb, block.input, seriesData);
            } catch (e) {
              out = `Error consultando FRED: ${e.message}`;
            }
          } else if (block.name === "obtener_serie_bcra") {
            try {
              out = await obtenerSerieBCRA(sb, block.input, seriesData);
            } catch (e) {
              out = `Error consultando BCRA: ${e.message}`;
            }
          } else if (block.name === "obtener_serie_bea") {
            try {
              out = await obtenerSerieBEA(sb, block.input, seriesData);
            } catch (e) {
              out = `Error consultando BEA: ${e.message}`;
            }
          } else {
            out = "Herramienta desconocida.";
          }
          results.push({ type: "tool_result", tool_use_id: block.id, content: out });
        }
        apiMessages.push({ role: "user", content: results });
        continue;
      }

      const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      return Response.json({ text, series: seriesData, solicitudes });
    }
    return Response.json({ text: "No pude completar la consulta.", series: seriesData, solicitudes });
  } catch (e) {
    return Response.json({ text: `Error: ${e.message}`, series: [], solicitudes: [] }, { status: 500 });
  }
}
