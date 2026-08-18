import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUpload, mockGetPublicUrl } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://cdn/x.jpg' } })),
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }) },
  },
}));

import { uploadTenantImage, validarImagen, TAMANO_MAX } from '../services/platformStorage';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/x.jpg' } });
});

const TENANT = '11111111-1111-1111-1111-111111111111';

function archivo({ name = 'foto.jpg', type = 'image/jpeg', size = 1000 } = {}) {
  return { name, type, size };
}

describe('validarImagen', () => {
  it('acepta una foto normal', () => {
    expect(validarImagen(archivo())).toBeNull();
  });

  it('rechaza extensiones y tipos que no son imagen', () => {
    expect(validarImagen(archivo({ name: 'virus.exe', type: 'application/x-msdownload' }))).toBeTruthy();
    // Extension valida pero el contenido dice otra cosa.
    expect(validarImagen(archivo({ name: 'truco.jpg', type: 'application/pdf' }))).toBeTruthy();
  });

  it('rechaza lo que pasa el limite, con el peso en el mensaje', () => {
    const msg = validarImagen(archivo({ size: TAMANO_MAX + 1 }));
    expect(msg).toMatch(/5 MB/);
  });
});

describe('uploadTenantImage', () => {
  // El aislamiento entre negocios lo sostiene la carpeta: la policy de
  // storage.objects mira la PRIMERA carpeta del path. Si el path dejara de
  // empezar con el tenant, la RLS rechaza todo (o peor, si empezara con otro
  // tenant, escribiria donde no debe).
  it('guarda dentro de la carpeta del tenant', async () => {
    mockUpload.mockResolvedValue({ data: { path: `${TENANT}/producto-1.jpg` }, error: null });

    const url = await uploadTenantImage(TENANT, archivo(), { prefix: 'producto' });

    const path = mockUpload.mock.calls[0][0];
    expect(path.startsWith(`${TENANT}/`)).toBe(true);
    expect(path).toMatch(/\/producto-\d+-[a-z0-9]+\.jpg$/);
    expect(url).toBe('https://cdn/x.jpg');
  });

  it('sin tenantId falla en vez de subir a cualquier lado', async () => {
    await expect(uploadTenantImage(null, archivo())).rejects.toThrow(/tenantId/);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('no sube si el archivo no pasa la validacion', async () => {
    const r = await uploadTenantImage(TENANT, archivo({ name: 'x.exe', type: 'application/x-msdownload' }));
    expect(r.__error).toBeTruthy();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('el prefijo se sanea: no puede escaparse de la carpeta', async () => {
    mockUpload.mockResolvedValue({ data: { path: 'p' }, error: null });
    await uploadTenantImage(TENANT, archivo(), { prefix: '../../otro' });
    const path = mockUpload.mock.calls[0][0];
    expect(path.startsWith(`${TENANT}/`)).toBe(true);
    expect(path).not.toContain('..');
  });

  it('un error del server vuelve en castellano, no crudo', async () => {
    mockUpload.mockResolvedValue({ data: null, error: { message: 'Payload too large: exceeded maximum size' } });
    const r = await uploadTenantImage(TENANT, archivo());
    expect(r.__error).toMatch(/5 MB/);
    expect(r.__error).not.toMatch(/Payload/);
  });

  it('cada subida usa un nombre nuevo: no pisa la imagen anterior', async () => {
    mockUpload.mockResolvedValue({ data: { path: 'p' }, error: null });
    await uploadTenantImage(TENANT, archivo());
    await uploadTenantImage(TENANT, archivo());
    const [p1, p2] = mockUpload.mock.calls.map(c => c[0]);
    expect(p1).not.toBe(p2);
    // upsert:false — si por un choque de nombres existiera, falla en vez de
    // reemplazar la foto de otro producto.
    expect(mockUpload.mock.calls[0][2]).toMatchObject({ upsert: false });
  });
});
