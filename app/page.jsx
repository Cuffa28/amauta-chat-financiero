"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "../lib/supabase";
import Chart from "../components/Chart";

const EJEMPLOS = [
  "Histórico de Apple del último año",
  "Inflación de EE.UU. (CPI) últimos 5 años",
  "Tasa de desempleo de EE.UU.",
  "S&P 500 últimos 6 meses",
];

export default function Home() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hola 👋 Pedime cualquier serie histórica de mercado o macro y te la traigo. Por ejemplo: *«el histórico del dólar oficial del último año»* o *«la inflación de EE.UU.»*." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState([]);
  const finRef = useRef(null);
  const [escuchando, setEscuchando] = useState(false);
  const [vozOk, setVozOk] = useState(false);
  const recRef = useRef(null);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Dictado por voz (Web Speech API del navegador)
  useEffect(() => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) return;
    const rec = new SR();
    rec.lang = "es-AR";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setInput(txt);
    };
    rec.onend = () => setEscuchando(false);
    rec.onerror = () => setEscuchando(false);
    recRef.current = rec;
    setVozOk(true);
  }, []);

  function toggleVoz() {
    const rec = recRef.current;
    if (!rec) return;
    if (escuchando) { rec.stop(); setEscuchando(false); return; }
    setInput("");
    try { rec.start(); setEscuchando(true); } catch { setEscuchando(false); }
  }

  function pushMsg(m) { setMessages((prev) => [...prev, m]); }

  async function cargarSerieDeSupabase(ric, campo) {
    const { data: s } = await supabase.from("series").select("id,descripcion,fuente")
      .eq("ric", ric).eq("campo", campo).limit(1);
    if (!s || s.length === 0) return null;
    const { data: obs } = await supabase.from("observaciones").select("fecha,valor")
      .eq("serie_id", s[0].id).order("fecha").limit(5000);
    if (!obs || obs.length === 0) return null;
    return { ric, campo, descripcion: s[0].descripcion, fuente: s[0].fuente, data: obs };
  }

  function quitarSerie(ric, campo) {
    setSeries((prev) => prev.filter((x) => !(x.ric === ric && x.campo === campo)));
  }

  async function esperarSolicitud(sol) {
    pushMsg({ role: "estado", text: `Bajando ${sol.ric} desde Reuters…` });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const { data } = await supabase.from("solicitudes").select("estado,detalle").eq("id", sol.id).limit(1);
      const estado = data?.[0]?.estado;
      if (estado === "lista") {
        const serie = await cargarSerieDeSupabase(sol.ric, sol.campo);
        if (serie) {
          setSeries((prev) => [serie, ...prev.filter((x) => !(x.ric === serie.ric && x.campo === serie.campo))]);
          pushMsg({ role: "estado", text: `✓ ${sol.ric} lista (${serie.data.length} datos).` });
        }
        return;
      }
      if (estado === "error") {
        pushMsg({ role: "estado", text: `✗ No se pudo bajar ${sol.ric}: ${data?.[0]?.detalle || ""}` });
        return;
      }
    }
    pushMsg({ role: "estado", text: `El pedido de ${sol.ric} está tardando. ¿Está el worker local corriendo?` });
  }

  async function enviar(texto) {
    const pregunta = (texto ?? input).trim();
    if (!pregunta || loading) return;
    setInput("");
    pushMsg({ role: "user", text: pregunta });
    setLoading(true);
    try {
      const historial = [...messages, { role: "user", text: pregunta }]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.text }));
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historial }),
      });
      const data = await res.json();
      pushMsg({ role: "assistant", text: data.text });
      if (data.series?.length) {
        setSeries((prev) => [
          ...data.series,
          ...prev.filter((x) => !data.series.some((n) => n.ric === x.ric && n.campo === x.campo)),
        ]);
      }
      for (const sol of data.solicitudes || []) await esperarSolicitud(sol);
    } catch (e) {
      pushMsg({ role: "assistant", text: `Error de conexión: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <nav className="navbar">
        <svg className="logo" viewBox="0 0 100 100" aria-label="Amauta">
          <rect x="20" y="20" width="60" height="60" rx="6" transform="rotate(45 50 50)" fill="#F3CF11" />
          <g stroke="#231F20" strokeWidth="2.4" strokeLinecap="round">
            <line x1="50" y1="28" x2="50" y2="72" /><line x1="28" y1="50" x2="72" y2="50" />
            <line x1="34" y1="34" x2="66" y2="66" /><line x1="66" y1="34" x2="34" y2="66" />
            <line x1="50" y1="31" x2="50" y2="69" transform="rotate(22.5 50 50)" />
            <line x1="50" y1="31" x2="50" y2="69" transform="rotate(67.5 50 50)" />
            <line x1="50" y1="33" x2="50" y2="67" transform="rotate(112.5 50 50)" />
            <line x1="50" y1="33" x2="50" y2="67" transform="rotate(157.5 50 50)" />
          </g>
        </svg>
        <div className="brand">
          <div className="titulo">AMAUTA <span className="titulo-sep">·</span> <span className="titulo-2">Chat Financiero</span></div>
          <div className="sub">Series históricas de mercado y macro · Reuters · BCRA · BLS · FRED · BEA</div>
        </div>
      </nav>

      <div className="app">
        {/* CHAT */}
        <div className="card chat">
          <div className="card-header">💬 Consultá una serie</div>
          <div className="chat-mensajes">
            {messages.map((m, i) => (
              <div key={i} className={`burbuja ${m.role}`}>
                {m.role === "assistant"
                  ? <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div>
                  : m.text}
              </div>
            ))}
            {loading && <div className="burbuja estado"><span className="spinner" /> Analizando…</div>}
            <div ref={finRef} />
          </div>
          <div style={{ padding: "0 14px" }}>
            <div className="chips">
              {EJEMPLOS.map((e) => (
                <div key={e} className="chip" onClick={() => enviar(e)}>{e}</div>
              ))}
            </div>
          </div>
          <div className="chat-input">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              placeholder={escuchando ? "Escuchando… hablá tu consulta" : "Escribí o dictá por voz tu consulta…"} />
            {vozOk && (
              <button className={`mic ${escuchando ? "rec" : ""}`} onClick={toggleVoz}
                title={escuchando ? "Detener dictado" : "Dictar por voz"}>
                {escuchando ? "● REC" : "🎤"}
              </button>
            )}
            <button className="btn" onClick={() => enviar()} disabled={loading}>Enviar</button>
          </div>
        </div>

        {/* PANEL DE DATOS */}
        <div className="card">
          <div className="card-header">📊 Visualización {series.length > 0 && `· ${series.length} serie${series.length > 1 ? "s" : ""}`}
            {series.length > 0 && <button className="limpiar" onClick={() => setSeries([])}>Limpiar</button>}
          </div>
          <div className="panel">
            {series.length === 0
              ? <div className="vacio">Acá van a aparecer los gráficos interactivos de las series que consultes.<br /><br />Probá pedir dos series (ej: «Apple» y después «Microsoft») para compararlas en base 100.</div>
              : <Chart series={series} onRemove={quitarSerie} />}
          </div>
        </div>
      </div>

      <div className="disclaimer">
        Este material es preparado por Amauta Inversiones Financieras (Matrícula CNV 1029) con fines informativos y no
        constituye una recomendación de inversión. La información proviene de fuentes consideradas confiables, sin garantizar
        su exactitud ni completitud. Las inversiones en mercados financieros implican riesgos, incluyendo la posible pérdida
        del capital invertido. Rentabilidades pasadas no garantizan resultados futuros.
      </div>
    </>
  );
}
