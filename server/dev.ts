async function main() {
  const { serve } = await import('@hono/node-server');
  const { default: app } = await import('./app.ts');

  const port = Number(process.env.PORT ?? 3001);

  serve({ fetch: app.fetch, port }, () => {
    console.log(`API server running at http://localhost:${port}`);
  });

  const onShutdown = () => {
    process.exit(0);
  };
  process.on('SIGINT', onShutdown);
  process.on('SIGTERM', onShutdown);
}

main();
