"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="state-page"><div className="state-card"><h2>Não foi possível carregar o painel</h2><p>Confira a conexão com o PostgreSQL e tente novamente.</p><button className="primary full" onClick={reset}>Tentar novamente</button></div></main>; }
