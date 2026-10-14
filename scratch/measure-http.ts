async function measureHttp() {
  const routes = [
    "http://localhost:3000/",
    "http://localhost:3000/login",
    "http://localhost:3000/register",
    "http://localhost:3000/terms",
    "http://localhost:3000/privacy",
    "http://localhost:3000/api/catalog/status"
  ];

  console.log("\n=== HTTP Route Latency (Development Server: next dev) ===");
  for (const url of routes) {
    // Warm up / first run
    const t0 = performance.now();
    const res1 = await fetch(url);
    const t1 = performance.now();

    // Second run (cached/compiled)
    const t2 = performance.now();
    const res2 = await fetch(url);
    const t3 = performance.now();

    const path = new URL(url).pathname;
    console.log(`Route ${path.padEnd(25)} | 1st hit: ${(t1 - t0).toFixed(1).padStart(7)} ms | 2nd hit: ${(t3 - t2).toFixed(1).padStart(7)} ms | Status: ${res2.status}`);
  }
}

measureHttp().catch(console.error);
