// Punto de entrada del sistema de emails. Lo PURO (templates/render/layout) se
// puede importar desde cualquier lado; el envio (enqueue) es server-only y se
// importa por su ruta directa para no arrastrar "server-only" al cliente.
export * from "./templates";
