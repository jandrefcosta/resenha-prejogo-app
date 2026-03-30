import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Resenha Pré-Jogo — Futebol Brasileiro';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #18181b 0%, #111112 50%, #0a0a0b 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          padding: '80px',
          position: 'relative',
        }}
      >
        {/* Red accent bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '6px',
            background: 'linear-gradient(90deg, #E8212B 0%, #ff6b6b 100%)',
          }}
        />

        {/* Tag */}
        <div
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 20,
          }}
        >
          Campeonato Brasileiro Série A
        </div>

        {/* Title */}
        <div
          style={{
            color: '#ffffff',
            fontSize: 80,
            fontWeight: 800,
            lineHeight: 1.05,
            marginBottom: 28,
            letterSpacing: '-0.02em',
          }}
        >
          Resenha{' '}
          <span style={{ color: '#E8212B' }}>Pré-Jogo</span>
        </div>

        {/* Description */}
        <div
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.4,
          }}
        >
          Próximos jogos · Onde assistir · Análise IA
        </div>
      </div>
    ),
    { ...size },
  );
}
