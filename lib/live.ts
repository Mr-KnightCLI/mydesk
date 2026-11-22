import { XMLParser } from "fast-xml-parser";
import type { Message, Thread } from "./tasks";

type Feed = "weather" | "stocks" | "news" | "cricket";
const parser = new XMLParser({ isArray: name => name === "item" });
async function get(url: string) {
  const response = await fetch(url, {cache:"no-store", signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw Error("Feed unavailable");
  return response;
}
function safeLink(raw: string) {
  try {const url=new URL(raw); if(["http:","https:"].includes(url.protocol)){url.protocol="https:";return url.href}}catch{}
  return "";
}
export async function liveReply(input:string, thread:Thread, zone:string, sample:boolean):Promise<Message|undefined>{
  const q=input.trim().replace(/[?!]+$/,"");
  let feed:Feed|undefined;
  if (/\b(weather|temperature|forecast)\b/i.test(q)) feed="weather";
  else if (/\b(stock price|share price|stock quote|stocks?|shares)\b/i.test(q)) feed="stocks";
  else if (/\b(news|headlines)\b/i.test(q)) feed="news";
  else if (/\bcricket\b|\b(?:IPL|India)\b.*\bscore\b/i.test(q)) feed="cricket";
  const followUp=thread.awaitingFeed;
  delete thread.awaitingFeed;
  if(!feed && followUp && q.length<=80)feed=followUp;
  if(!feed || /^(?:explain|define|teach|what is a|how (?:do|does|to))\b/i.test(q))return;
  const say=(text:string,links?:Message["links"]):Message=>({role:"assistant",text,links});
  if(sample)return say("Sign in to your personal workspace to look up live data.");
  const stamp=(date:string|number)=>new Date(date).toLocaleString("en",{timeZone:zone,timeZoneName:"short"});
  try{
    if(feed==="weather"){
      const city=(followUp==="weather" && !/weather|temperature|forecast/i.test(q)?q:q.match(/(?:\bin|\bfor|\bat)\s+(.+)/i)?.[1]||q.match(/^(.+?)\s+weather$/i)?.[1]||"").replace(/\b(?:today|tomorrow|right now|now|please)\b/gi,"").trim();
      if(!city){thread.awaitingFeed="weather";return say("Which city should I check?")}
      const place=(await (await get("https://geocoding-api.open-meteo.com/v1/search?count=1&name="+encodeURIComponent(city))).json()).results?.[0];
      if(!place)return say("I couldn’t find that city. Try “weather in Mumbai”.");
      const url=new URL("https://api.open-meteo.com/v1/forecast");
      url.search=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),timezone:"auto",current:"temperature_2m,apparent_temperature,precipitation",daily:"temperature_2m_min,temperature_2m_max",forecast_days:"2"}).toString();
      const data=await (await get(url.href)).json(),cur=data.current,day=data.daily;
      if(!cur||!day)throw Error();
      return say(place.name+", "+place.country+" · "+cur.temperature_2m+" °C, feels like "+cur.apparent_temperature+" °C. Precipitation: "+cur.precipitation+" mm.\nToday: "+day.temperature_2m_min[0]+"–"+day.temperature_2m_max[0]+" °C. Tomorrow: "+day.temperature_2m_min[1]+"–"+day.temperature_2m_max[1]+" °C.\nWeather model update: "+cur.time.replace("T"," ")+" ("+data.timezone+").",[{title:"Open-Meteo forecast data",url:url.href}]);
    }
    if(feed==="stocks"){
      const term=(followUp==="stocks"?q:q.replace(/^(?:what(?:’s|'s| is)|show me|get me|check|give me)\s+/i,"").replace(/\b(?:the|current|latest|today|stock|stocks|share|shares|price|quote|of|for|please)\b/gi,"")).trim();
      if(!term){thread.awaitingFeed="stocks";return say("Which company or ticker should I look up?")}
      const search=await (await get("https://query1.finance.yahoo.com/v1/finance/search?quotesCount=5&newsCount=0&q="+encodeURIComponent(term))).json();
      const item=search.quotes?.find((x:{quoteType:string})=>["EQUITY","ETF","INDEX"].includes(x.quoteType));
      if(!item)return say("I couldn’t match that company. Try its ticker, such as AAPL or RELIANCE.NS.");
      const symbol=encodeURIComponent(item.symbol),data=await (await get("https://query1.finance.yahoo.com/v8/finance/chart/"+symbol+"?interval=1d&range=1d")).json();
      const m=data.chart?.result?.[0]?.meta;if(!Number.isFinite(m?.regularMarketPrice)||!m.regularMarketTime)throw Error();
      return say((item.shortname||item.symbol)+" ("+item.symbol+") · "+m.regularMarketPrice+" "+m.currency+"\nLatest regular-session quote: "+stamp(m.regularMarketTime*1000)+". Exchange data may be delayed.",[{title:"Yahoo Finance · "+item.symbol,url:"https://finance.yahoo.com/quote/"+symbol+"/"}]);
    }
    const news=feed==="news";
    const topic=q.match(/(?:news|headlines)\s+(?:on|about|in|for)\s+(.+)/i)?.[1]||q.match(/^(?:latest\s+)?([\w -]+?)\s+(?:news|headlines)$/i)?.[1]||"";
    const filter=topic.replace(/\b(?:show|me|the|today|latest|top|current|give)\b/gi,"").trim();
    const url=news?"https://news.google.com/rss"+(filter?"/search?q="+encodeURIComponent(filter)+"&":"?")+"hl=en-IN&gl=IN&ceid=IN:en":"https://www.espncricinfo.com/rss/livescores.xml";
    const channel=parser.parse(await (await get(url)).text()).rss?.channel;
    if(!channel)throw Error();
    const teams=news?[]:q.match(/\b(?:india|england|australia|pakistan|bangladesh|afghanistan|sri lanka|new zealand|west indies|south africa)\b/gi)||[];
    const items=(channel.item||[]).filter((i:{title:string})=>teams.every(team=>i.title.toLowerCase().includes(team.toLowerCase()))).slice(0,5);
    if(!items.length)return say("The feed has no matching "+(news?"headlines":"cricket scores")+" right now.");
    const lines=items.map((i:{title:string,pubDate?:string},idx:number)=>(idx+1)+". "+i.title.trim()+(news&&i.pubDate?" · "+stamp(i.pubDate):""));
    return say((news?"Latest headlines":"Cricket scoreboard")+"\n"+lines.join("\n")+"\n"+(channel.pubDate||channel.lastBuildDate?"Feed updated: "+stamp(channel.pubDate||channel.lastBuildDate):"Retrieved: "+stamp(Date.now())),items.map((i:{link:string},idx:number)=>({title:(news?"Article ":"Scorecard ")+(idx+1),url:safeLink(i.link)})).filter((x:{url:string})=>x.url));
  }catch{return say("The "+feed+" feed is unavailable right now. Try again shortly.")}
}
