import 'server-only';
import { JWT } from 'google-auth-library';

/* Klien Google Sheets kecil, memakai akun robot Firebase (service account).
   Sheet tujuan harus dibagikan ke email akun robot itu sebagai Editor. */
export async function sheetsApi(sheetId: string) {
  const jwt = new JWT({
    email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const { token } = await jwt.getAccessToken();
  const call = async (path: string, body?: unknown) => {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Sheets API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  };
  const tabs = async (): Promise<{ sheetId: number; title: string }[]> =>
    (await call('?fields=sheets.properties(sheetId,title)')).sheets.map((s: { properties: { sheetId: number; title: string } }) => s.properties);
  return { call, tabs };
}

export const a1 = (title: string) => `'${title.replace(/'/g, "''")}'`;
export const isDefaultTab = (title: string) => /^(Sheet|Lembar)\s?1$/.test(title);
