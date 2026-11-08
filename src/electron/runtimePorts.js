// 发布应用保持固定端口；隔离回归进程可与用户正在使用的播放器并行运行。
function testPort(name, fallback) {
  if (process.env.IS_TEST !== 'true') return fallback;
  const port = Number(process.env[name]);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

export const apiPort = testPort('YPM_TEST_API_PORT', 10754);
export const rendererPort = testPort('YPM_TEST_RENDERER_PORT', 27232);
export const rendererOrigin = `http://localhost:${rendererPort}`;
