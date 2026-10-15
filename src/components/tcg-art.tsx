/* eslint-disable @next/next/no-img-element -- Usa a mesma imagem HTTPS já cadastrada no catálogo. */
"use client";

import type { PointerEvent } from "react";
import { Droplets, Flame, Layers, Sparkles, Zap } from "lucide-react";

export function GeekMark() {
  return <span className="geek-mark" aria-hidden="true"><Layers size={23}/><Sparkles size={10}/></span>;
}

type Artwork = { name: string; imageUrl?: string | null };

/** Arte original de cartas, usada quando a loja ainda não tem imagens cadastradas. */
export function TcgCardFan({ cards = [] }: { cards?: Artwork[] }) {
  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${((event.clientX - bounds.left) / bounds.width - .5) * 12}deg`);
    event.currentTarget.style.setProperty("--pointer-y", `${((event.clientY - bounds.top) / bounds.height - .5) * -8}deg`);
  }
  function reset(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.style.setProperty("--pointer-x", "0deg");
    event.currentTarget.style.setProperty("--pointer-y", "0deg");
  }
  const elements = [Droplets, Zap, Flame];
  return <div className="tcg-fan" onPointerMove={move} onPointerLeave={reset} aria-hidden="true">
    <div className="tcg-orbit"/><span className="tcg-spark spark-one">✦</span><span className="tcg-spark spark-two">✧</span>
    {elements.map((Icon, index) => {
      const card = cards[[1, 0, 2][index]];
      const image = card?.imageUrl?.startsWith("https://") ? card.imageUrl : null;
      return <div key={index} className={`tcg-fan-card tcg-element-${index}${image ? " has-art" : ""}`}>
        {image ? <img src={image} alt="" loading="lazy"/> : <><div className="tcg-card-top"><span>GEEKPRICE</span><Sparkles size={12}/></div><div className="tcg-energy"><i/><Icon strokeWidth={1.3}/><i/></div><div className="tcg-card-bottom"><span>COLLECTOR SERIES</span><span>◆ ◆ ◆</span></div></>}
        <div className="tcg-foil"/>
      </div>;
    })}
    <span className="tcg-fan-caption"><Layers size={12}/> Feito para quem entende de cartas.</span>
  </div>;
}
