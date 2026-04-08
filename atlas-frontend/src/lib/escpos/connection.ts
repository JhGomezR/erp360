import { encodePayload, type PrintPayload } from './encoder';

export type ConnectionType = 'network' | 'usb' | 'serial' | 'bluetooth';

export interface PrinterConfig {
  connection_type: ConnectionType;
  host?: string;
  port?: number;
  baud_rate?: number;
}

// Augment navigator for WebUSB (Chrome-only API, not in TS lib by default)
interface USBDevice {
  open(): Promise<void>;
  close(): Promise<void>;
  configuration: { interfaces: USBInterface[] } | null;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<unknown>;
}
interface USBInterface {
  alternate: { endpoints: { direction: string; type: string; endpointNumber: number }[] };
}
interface USB {
  requestDevice(options: { filters: unknown[] }): Promise<USBDevice>;
}

export async function printViaWebUSB(data: Uint8Array): Promise<void> {
  const usb = (navigator as unknown as { usb?: USB }).usb;
  if (!usb) throw new Error('WebUSB no está disponible en este navegador. Usa Chrome/Edge en HTTPS.');
  const device = await usb.requestDevice({ filters: [] });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  await device.claimInterface(0);
  const iface = device.configuration!.interfaces[0];
  const ep = iface.alternate.endpoints.find(
    (e) => e.direction === 'out' && e.type === 'bulk',
  );
  if (!ep) throw new Error('No se encontró endpoint bulk-out en la impresora USB.');
  await device.transferOut(ep.endpointNumber, data);
  await device.close();
}

export async function printViaWebSerial(data: Uint8Array, baudRate = 9600): Promise<void> {
  if (!('serial' in navigator)) {
    throw new Error('Web Serial no está disponible. Usa Chrome/Edge en HTTPS.');
  }
  const port = await (navigator as unknown as { serial: { requestPort(): Promise<{
    open(opts: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    writable: { getWriter(): { write(d: Uint8Array): Promise<void>; releaseLock(): void } };
  }> } }).serial.requestPort();
  await port.open({ baudRate });
  const writer = port.writable.getWriter();
  await writer.write(data);
  writer.releaseLock();
  await port.close();
}

export async function printEscPos(
  printer: PrinterConfig,
  payload: PrintPayload,
): Promise<{ success: boolean; message: string }> {
  const data = encodePayload(payload);
  try {
    if (printer.connection_type === 'usb') {
      await printViaWebUSB(data);
    } else if (printer.connection_type === 'serial') {
      await printViaWebSerial(data, printer.baud_rate ?? 9600);
    } else if (printer.connection_type === 'bluetooth') {
      throw new Error('Bluetooth: usa la app nativa o conecta vía un adaptador serial.');
    } else {
      throw new Error(
        'Red (TCP): los navegadores no pueden abrir sockets TCP directamente. Usa impresión HTML o instala el bridge de Atlas.',
      );
    }
    return { success: true, message: 'Impreso correctamente' };
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e?.name === 'NotFoundError' || e?.name === 'AbortError') {
      return { success: false, message: 'Impresión cancelada por el usuario.' };
    }
    return { success: false, message: e?.message ?? 'Error al imprimir' };
  }
}
