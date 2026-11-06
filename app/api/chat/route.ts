import { NextResponse } from "next/server";

function cleanText(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[Ī]/g, "I").replace(/[ī]/g, "i")
    .replace(/[ṭ]/g, "t").replace(/[ḍ]/g, "d")
    .replace(/[ṇ]/g, "n").replace(/[ś]/g, "s")
    .replace(/[ṣ]/g, "s").replace(/[ā]/g, "a")
    .replace(/[Ā]/g, "A").replace(/[ū]/g, "u")
    .replace(/[Ū]/g, "U").replace(/[ṛ]/g, "r")
    .replace(/[ṃ]/g, "m").replace(/[ñ]/g, "n");
}

let weatherCache = new Map<string, { data: string; time: number }>();

async function getWeatherForCity(cityName: string) {
  const key = cityName.toLowerCase();
  if (weatherCache.has(key) && Date.now() - weatherCache.get(key)!.time < 10 * 60 * 1000) return weatherCache.get(key)!.data;
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`);
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) return null;
    const place = geoData.results[0];
    const displayName = cleanText(place.name + (place.country ? `, ${place.country}` : ""));
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
    const data = await res.json();
    const c = data.current;
    const result = `${displayName} ma ahile ${c.temperature_2m}°C cha, feel huncha ${c.apparent_temperature}°C jasto. Humidity ${c.relative_humidity_2m}%, hawa ${c.wind_speed_10m} km/h.`;
    weatherCache.set(key, { data: result, time: Date.now() });
    return result;
  } catch { return null; }
}

function extractCity(text: string): string {
  let t = text.toLowerCase();
  t = t.replace(/ko temperature|temperature|temp|mausam|kasto cha|k ho|kati cha|kati|kasto|cha\?|k\?|\?|xa/g, "").replace(/ma |ko |ki |ke /g, " ").trim();
  const words = t.split(" ").filter(Boolean);
  if (words.length === 0) return "itahari";
  return words[words.length - 1] || "itahari";
}

function doHisab(text: string): string | null {
  const match = text.match(/(\d+)\s*([+\-*/xX])\s*(\d+)/);
  if (!match) return null;
  const a = Number(match[1]); const b = Number(match[3]); const op = match[2];
  let ans = 0;
  if (op === "+") ans = a + b;
  if (op === "-") ans = a - b;
  if (op === "*" || op === "x" || op === "X") ans = a * b;
  if (op === "/") ans = a / b;
  return `${a} ${op} ${b} = ${ans} ho kanchha!`;
}

// --- MEMORY: History bata naam nikalne, AI lai bharosa nagarne ---
function rememberFromHistory(messages: any[]): { name?: string } {
  let name: string | undefined;
  for (const m of messages) {
    if (m.role !== "user") continue;
    const txt = (m.content || "").toLowerCase();
    // "mero naam bhawani ho" -> bhawani
    const match = txt.match(/mero naam\s+([a-zA-Z]+)/);
    if (match) name = match[1];
    // "ma bhawani hu" -> bhawani
    const match2 = txt.match(/^ma\s+([a-zA-Z]+)\s+hu/);
    if (match2 && !name) name = match2[1];
  }
  return { name };
}

export async function POST(req: Request) {
  try {
    const { messages, image } = await req.json();

    if (image) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [{ role: "user", content: [{ type: "text", text: "Yo photo ma ke cha? Simple Roman Nepali ma, diacritic use nagari, choto ra ramailo garera bhan." }, { type: "image_url", image_url: { url: image } }] }],
          max_tokens: 400,
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      return NextResponse.json({ reply: cleanText(data.choices?.[0]?.message?.content || "Photo bujhna sakina.") });
    }

    const lastRaw = messages[messages.length - 1]?.content || "";
    const last = lastRaw.toLowerCase();
    const memory = rememberFromHistory(messages);

    // --- MEMORY CHECK: Naam sodhyo bhane sidha memory bata, AI lai nasodha ---
    if ((last.includes("mero naam") && (last.includes("k ho") || last.includes("ke ho") || last.includes("k") || last.includes("re"))) || last === "mero naam k ho re?" || last.includes("mero naam k ho")) {
      if (memory.name) {
        const cap = memory.name.charAt(0).toUpperCase() + memory.name.slice(1);
        return NextResponse.json({ reply: cleanText(`Timro naam ${cap} ho! Birsya jasto lagya? 😊`) });
      }
    }
    // "ma ko hu?" / "maile k bhaneko thiye?"
    if (last.includes("ma ko hu") || last.includes("maile aghi k bhaneko")) {
      if (memory.name) return NextResponse.json({ reply: cleanText(`Timi ${memory.name.charAt(0).toUpperCase() + memory.name.slice(1)} hau ni!`) });
    }

    if (last.includes("mausam") || last.includes("temp") || last.includes("garmi") || last.includes("chiso")) {
      const city = extractCity(lastRaw);
      const weather = await getWeatherForCity(city);
      if (weather) return NextResponse.json({ reply: cleanText(weather) });
    }

    const hisab = doHisab(lastRaw);
    if (hisab) return NextResponse.json({ reply: cleanText(hisab) });

    // --- AI lai pani memory dine ---
    const memoryLine = memory.name ? `User ko naam ${memory.name} ho. Yo kura birsinu hudaina, sodhyo bhane yahi bhan.` : "";

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content: `Timi Sajilo Sathi hau, Itahari ko sathi. Simple Roman Nepali ma bol. Diacritic use NAGAR.
            ${memoryLine}
            RULES:
            - Robot jasto "Maaf gar, feri sodha ta" / "Yo kura malai thaha bhayena" KABHAI nabhan.
            - Casual kura lai casual jawab: "ani ni" -> "Ani ni, ma yahi chu ta! Timro k cha?"
            - Choto, ramailo jawab, max 3 line.`,
          },
          ...messages.slice(-15).map((m: any) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
        ],
        temperature: 0.8,
        max_tokens: 400,
      }),
    });
    const data = await res.json();
    return NextResponse.json({ reply: cleanText(data.choices?.[0]?.message?.content || "Oi! K bhaneko? Feri bhan ta 😊") });
  } catch (e: any) {
    return NextResponse.json({ reply: cleanText("Error: " + e.message) });
  }
}