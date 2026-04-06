import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Cortavatares – Recorta y edita avatares desde una imagen';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #5c6bc0 0%, #3949ab 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          color: '#fff',
        }}
      >
        <div style={{ fontSize: 80, marginBottom: 12, display: 'flex' }}>✂️</div>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-1px', display: 'flex' }}>
          Cortavatares
        </div>
        <div
          style={{
            fontSize: 28,
            opacity: 0.85,
            marginTop: 16,
            maxWidth: 700,
            textAlign: 'center',
            display: 'flex',
          }}
        >
          Sube una imagen, define el grid y recorta tus avatares
        </div>
      </div>
    ),
    { ...size }
  );
}
