'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DashboardPayload,
  Slide,
  GoalSlide,
  FunnelSlide,
  FarmingSlide,
  WalletSlide,
  RankingSlide,
  RankingSeller,
  CelebrationSlide,
  BirthdaysSlide,
  CompanyAnnivSlide,
  NewHireSlide,
  NewsSlide,
  WeatherSlide,
} from '@/lib/types';

/**
 * A TV.
 *
 * A marcação e as classes são as mesmas do protótipo aprovado — a diferença
 * é que os dados agora chegam do backend em vez de um array fixo, e o painel
 * se re-busca sozinho de tempos em tempos, sem ninguém precisar dar F5.
 */

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

function Avatar({
  name,
  avatarUrl,
  color,
  className = 'avatar',
}: {
  name: string;
  avatarUrl?: string | null;
  color?: string;
  className?: string;
}) {
  return (
    <div className={className} style={{ background: avatarUrl ? 'transparent' : color || 'var(--panel-line)' }}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} loading="lazy" />
      ) : (
        initials(name)
      )}
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(() => {
    const colors = ['var(--gold)', 'var(--mint)', 'var(--coral)', 'var(--sky)'];
    return Array.from({ length: 36 }, (_, i) => ({
      left: Math.random() * 100,
      size: 6 + Math.random() * 8,
      dur: 3 + Math.random() * 3,
      delay: Math.random() * 3,
      color: colors[i % colors.length],
    }));
  }, []);

  return (
    <>
      {pieces.map((p, i) => (
        <div
          key={i}
          className="confetti"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 1.6}px`,
            background: p.color,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * SLIDES
 * ------------------------------------------------------------------ */

function Eyebrow({ slide, monthName }: { slide: Slide; monthName: string }) {
  return (
    <div className="eyebrow">
      {slide.showMonth ? `${slide.eyebrow} · ${monthName}` : slide.eyebrow}
    </div>
  );
}

function GoalView({ s, monthName }: { s: GoalSlide; monthName: string }) {
  if (s.metaValor == null) {
    return (
      <>
        <Eyebrow slide={s} monthName={monthName} />
        <div className="slide-empty">
          Meta de {monthName} ainda não cadastrada — defina no painel administrativo.
        </div>
        <div className="tiles-row">
          <div className="tile">
            <div className="n">{fmtBRL(s.atual)}</div>
            <div className="l">Realizado no mês</div>
          </div>
        </div>
      </>
    );
  }

  const pct = s.metaValor > 0 ? Math.round((s.atual / s.metaValor) * 100) : 0;
  const falta = Math.max(s.metaValor - s.atual, 0);

  return (
    <>
      <Eyebrow slide={s} monthName={monthName} />
      <div className="goal-num">
        {pct}
        <span className="accent">%</span>
      </div>
      <div className="goal-sub">
        da meta do time atingida — faltam{' '}
        <b style={{ color: 'var(--paper)' }}>{fmtBRL(falta)}</b> para bater o mês
      </div>
      <div className="progress-wrap">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <div className="progress-labels">
          <span>{fmtBRL(s.atual)}</span>
          <span>Meta: {fmtBRL(s.metaValor)}</span>
        </div>
      </div>
      <div className="tiles-row">
        <div className="tile">
          <div className="n">{s.clientesAtivados}</div>
          <div className="l">Clientes ativados</div>
        </div>
        <div className="tile">
          <div className="n">{fmtBRL(s.creditoAprovado)}</div>
          <div className="l">Crédito aprovado no mês</div>
        </div>
      </div>
      <div className="clientes-lista">
        {s.clientesLista.map((c) => (
          <span className="client-chip" key={c}>
            {c}
          </span>
        ))}
      </div>
    </>
  );
}

function FunnelView({ s, monthName }: { s: FunnelSlide; monthName: string }) {
  return (
    <>
      <Eyebrow slide={s} monthName={monthName} />
      <div className="funnel-subtitle">{s.subtitle}</div>
      <div className="funnel-single">
        <div className="temp-tiles">
          <div className="temp-tile quente">
            <span className="temp-label">🔥 Quente</span>
            <span className="temp-total">{fmtBRL(s.quenteTotal)}</span>
          </div>
          <div className="temp-tile morno">
            <span className="temp-label">🌤 Morno</span>
            <span className="temp-total">{fmtBRL(s.mornoTotal)}</span>
          </div>
        </div>
        <div className="hot-title">Top 3 negócios em destaque</div>
        <div className="deal-list">
          {s.top3.length === 0 && <div className="slide-empty">Nenhum negócio no período</div>}
          {s.top3.map((d) => (
            <div className="deal-card" key={d.name}>
              <div>
                <div className="name">{d.name}</div>
                <div className="val">{fmtBRL(d.value)}</div>
                {d.owner && <div className="stage-tag">{d.owner}</div>}
              </div>
              <span className={`temp ${d.temp}`}>{d.temp}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function FarmingView({ s, monthName }: { s: FarmingSlide; monthName: string }) {
  const max = Math.max(...s.farmers.map((f) => f.total), 1);
  return (
    <>
      <Eyebrow slide={s} monthName={monthName} />
      <div className="funnel-subtitle">Funil de operação por farmer · Nova operação e renovação</div>
      <div className="farming-grid">
        {s.farmers.length === 0 && <div className="slide-empty">Em apuração</div>}
        {s.farmers.map((f) => (
          <div className="farming-row" key={f.name}>
            <div className="farming-person">
              <Avatar name={f.name} avatarUrl={f.avatarUrl} className="mini-avatar" />
              <span className="name">{f.name}</span>
            </div>
            <div className="farming-bar">
              <div
                className="farming-seg nova"
                style={{ width: `${(f.novaOperacao / max) * 100}%` }}
                title={`Nova operação: ${fmtBRL(f.novaOperacao)}`}
              />
              <div
                className="farming-seg renov"
                style={{ width: `${(f.renovacao / max) * 100}%` }}
                title={`Renovação: ${fmtBRL(f.renovacao)}`}
              />
            </div>
            <div className="farming-total">{fmtBRL(f.total)}</div>
          </div>
        ))}
      </div>
      <div className="farming-legend">
        <span>
          <i className="nova" /> Nova operação · {fmtBRL(s.totalNovaOperacao)}
        </span>
        <span>
          <i className="renov" /> Renovação · {fmtBRL(s.totalRenovacao)}
        </span>
      </div>
    </>
  );
}

function WalletView({ s, monthName }: { s: WalletSlide; monthName: string }) {
  return (
    <>
      <Eyebrow slide={s} monthName={monthName} />
      <div className="wallet-image-wrap">
        {s.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="wallet-image" src={s.imageUrl} alt="Evolução da carteira nos últimos 30 dias" />
        ) : (
          <div className="wallet-empty">
            Nenhum gráfico enviado ainda — envie pelo painel administrativo.
          </div>
        )}
      </div>
      {s.caption && <div className="wallet-source">{s.caption}</div>}
    </>
  );
}

function sellerScore(v: RankingSeller) {
  return v.value ?? v.oportunidades ?? 0;
}

function RankingView({ s, monthName }: { s: RankingSlide; monthName: string }) {
  return (
    <>
      <Eyebrow slide={s} monthName={monthName} />
      <div className="division-grid">
        {s.divisions.map((div) => {
          const sorted = [...div.sellers].sort((a, b) => sellerScore(b) - sellerScore(a));
          return (
            <div className="division-card" key={div.name}>
              <div className="division-title">{div.name}</div>
              {sorted.length === 0 ? (
                <div className="division-empty">Em apuração</div>
              ) : (
                sorted.map((v, i) => (
                  <div className="mini-row" key={`${div.name}-${v.name ?? i}`}>
                    <div className="mini-pos">{i + 1}</div>
                    {v.people ? (
                      <>
                        <div className="mini-avatar-group">
                          {v.people.map((p) => (
                            <Avatar
                              key={p.id}
                              name={p.name}
                              avatarUrl={p.avatarUrl}
                              color={p.color}
                              className="mini-avatar stacked"
                            />
                          ))}
                        </div>
                        <div className="mini-info">
                          <div className="name">{v.people.map((p) => p.name).join(' & ')}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <Avatar
                          name={v.name}
                          avatarUrl={v.avatarUrl}
                          color={v.color}
                          className="mini-avatar"
                        />
                        <div className="mini-info">
                          <div className="name">{v.name}</div>
                          {v.deals ? (
                            <div className="meta">
                              {v.deals} negócio{v.deals > 1 ? 's' : ''}
                            </div>
                          ) : null}
                        </div>
                      </>
                    )}
                    <div className="mini-value">
                      {v.value != null
                        ? fmtBRL(v.value)
                        : v.oportunidades != null
                          ? `${v.oportunidades.toLocaleString('pt-BR')} ${v.metricLabel ?? 'oport.'}`
                          : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function CelebrationView({ s, monthName }: { s: CelebrationSlide; monthName: string }) {
  return (
    <div className="celebrate">
      <Confetti />
      <div className="bell">🔔</div>
      <div className="eyebrow" style={{ justifyContent: 'center' }}>
        {s.showMonth ? `${s.eyebrow} · ${monthName}` : s.eyebrow}
      </div>
      <div className="who-row">
        <Avatar name={s.who} avatarUrl={s.whoAvatar} className="who-avatar" />
        {s.partner && <Avatar name={s.partner} avatarUrl={s.partnerAvatar} className="who-avatar" />}
      </div>
      <div className="headline">
        <span className="who">{s.who}</span>
        {s.partner ? <> e <span className="who">{s.partner}</span></> : null} ativaram a conta {s.client}
      </div>
      <div className="amount">Valor ativado: {s.amount}</div>
      <div className="meta-line">
        {s.approvedLimit ? `Limite aprovado: ${s.approvedLimit} · ` : ''}
        {s.activationDate ? `Ativado em ${s.activationDate}` : ''}
      </div>
    </div>
  );
}

function BirthdaysView({ s, monthName }: { s: BirthdaysSlide; monthName: string }) {
  return (
    <>
      <Eyebrow slide={s} monthName={monthName} />
      {s.people.length === 0 ? (
        <div className="slide-empty">Nenhum aniversariante em {monthName}</div>
      ) : (
        <div className="grid-people">
          {s.people.map((p) => (
            <div className="person-card" key={p.name + p.date}>
              <Avatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} />
              <div className="name">{p.name}</div>
              <div className="date">{p.date}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CompanyAnnivView({ s, monthName }: { s: CompanyAnnivSlide; monthName: string }) {
  return (
    <>
      <Eyebrow slide={s} monthName={monthName} />
      {s.people.length === 0 ? (
        <div className="slide-empty">Nenhum aniversário de casa em {monthName}</div>
      ) : (
        <div className="anniv-grid">
          {s.people.map((p) => (
            <div className="anniv-row" key={p.name + p.date}>
              <Avatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="anniv-avatar" />
              <span className="anniv-name">{p.name}</span>
              <span className="anniv-years">
                {p.years} ano{p.years > 1 ? 's' : ''} de casa
              </span>
              <span className="anniv-date">{p.date}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function NewHireView({ s, monthName }: { s: NewHireSlide; monthName: string }) {
  return (
    <>
      <Eyebrow slide={s} monthName={monthName} />
      <div className="spotlight">
        <div className="avatar-big" style={{ background: s.avatarUrl ? 'transparent' : undefined }}>
          {s.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.avatarUrl} alt={s.name} />
          ) : (
            initials(s.name)
          )}
        </div>
        <div>
          <div className="goal-num" style={{ fontSize: 'clamp(30px,4vw,54px)' }}>
            {s.name}
          </div>
          <div className="role">
            {s.role} · {s.joined}
          </div>
          {s.quote && <div className="quote">{s.quote}</div>}
        </div>
      </div>
    </>
  );
}

function NewsView({ s, monthName }: { s: NewsSlide; monthName: string }) {
  return (
    <>
      <Eyebrow slide={s} monthName={monthName} />
      <div className="news-row">
        {s.items.map((n) => (
          <div className="news-card" key={n.title}>
            <span className={`news-tag ${n.tag}`}>{n.tag}</span>
            <h3>{n.title}</h3>
            <p>{n.text}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function WeatherView({ s, monthName }: { s: WeatherSlide; monthName: string }) {
  return (
    <>
      <Eyebrow slide={s} monthName={monthName} />
      <div className="weather-wrap">
        <div className="weather-main">
          <div className="city">{s.city}</div>
          <div className="temp">
            <span className="ico">{s.icon}</span>
            {s.temp}
          </div>
          <div className="cond">{s.cond}</div>
          <div className="temp-minmax">
            sensação {s.feelsLike} · máx {s.tempMax} · mín {s.tempMin} · chuva {s.rainProbability}%
          </div>
        </div>
        <div className="traffic-col">
          <div className="rodizio-tag">🚗 Rodízio hoje: {s.rodizio}</div>
          <div className="traffic-title">
            Lentidão por região <span style={{ opacity: 0.6 }}>({s.trafficUpdatedAt})</span>
          </div>
          {s.trafficAviso && <div className="slide-empty">{s.trafficAviso}</div>}
          {s.traffic.map((r) => (
            <div className="route" key={r.name}>
              <span className={`led ${r.level}`} />
              <span className="rname">{r.name}</span>
              <span className="rstatus">
                {r.km} km · {r.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SlideView({ slide, monthName }: { slide: Slide; monthName: string }) {
  switch (slide.type) {
    case 'goal':
      return <GoalView s={slide} monthName={monthName} />;
    case 'funnel':
      return <FunnelView s={slide} monthName={monthName} />;
    case 'farming':
      return <FarmingView s={slide} monthName={monthName} />;
    case 'wallet':
      return <WalletView s={slide} monthName={monthName} />;
    case 'ranking':
      return <RankingView s={slide} monthName={monthName} />;
    case 'celebration':
      return <CelebrationView s={slide} monthName={monthName} />;
    case 'birthdays':
      return <BirthdaysView s={slide} monthName={monthName} />;
    case 'companyAnniv':
      return <CompanyAnnivView s={slide} monthName={monthName} />;
    case 'newhire':
      return <NewHireView s={slide} monthName={monthName} />;
    case 'news':
      return <NewsView s={slide} monthName={monthName} />;
    case 'weather':
      return <WeatherView s={slide} monthName={monthName} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * ROTAÇÃO, RELÓGIO E TICKER
 * ------------------------------------------------------------------ */

export default function TV({ initialData }: { initialData: DashboardPayload }) {
  const [data, setData] = useState(initialData);
  const [current, setCurrent] = useState(0);
  const [clock, setClock] = useState({ time: '--:--', date: '—' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slides = data.slides;
  const slide = slides[current] ?? slides[0];

  // Relógio, sempre no fuso de São Paulo
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock({
        time: now.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        }),
        date: now.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          timeZone: 'America/Sao_Paulo',
        }),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Rotação automática
  useEffect(() => {
    if (slides.length === 0) return;
    timerRef.current = setTimeout(
      () => setCurrent((c) => (c + 1) % slides.length),
      slide?.duration ?? 18000
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, slides.length, slide?.duration]);

  // Busca dados novos a cada 5 minutos. O backend já guarda tudo em cache,
  // então isto é só a TV pegando o que o job de 2h deixou pronto.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const fresh: DashboardPayload = await res.json();
      if (fresh.slides?.length) {
        setData(fresh);
        setCurrent((c) => (c >= fresh.slides.length ? 0 : c));
      }
    } catch {
      // Silêncio proposital: se a rede falhar, a TV segue com o que já tem.
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  const goTo = (i: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrent(i);
  };

  const ticker = useMemo(() => buildTicker(data), [data]);

  if (!slide) {
    return (
      <div className="tv">
        <div className="stage">
          <div className="slide active">
            <div className="slide-empty">Sem dados para exibir.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tv">
      <div className="topbar">
        <div className="brand">
          <span className="dot" /> TV Comercial · Ao vivo
        </div>
        <div className="clockbox">
          <div className="time">{clock.time}</div>
          <div className="date">{clock.date}</div>
          <div className="update-stamp">
            Última atualização: {data.lastUpdate ?? '—'}
            {data.degraded.length > 0 && (
              <span className="warn"> · {data.degraded.length} fonte(s) instável(is)</span>
            )}
          </div>
        </div>
      </div>

      <div className="stage">
        <div className="slide active" key={current}>
          <SlideView slide={slide} monthName={data.monthName} />
        </div>
      </div>

      <div className="bottom">
        <div className="progressbar">
          <div
            className="fill animate"
            key={`p-${current}`}
            style={{ animationDuration: `${slide.duration}ms` }}
          />
        </div>
        <div className="ticker-wrap">
          <div className="ticker-label">AGORA</div>
          <div className="ticker-track">
            <div className="ticker-move">
              {ticker.map((b, i) => (
                <span key={i} dangerouslySetInnerHTML={{ __html: b }} />
              ))}
            </div>
          </div>
        </div>
        <div className="dots">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`dot-btn${i === current ? ' on' : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Ir para o slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Frases do ticker, montadas a partir dos slides disponíveis. */
function buildTicker(data: DashboardPayload): string[] {
  const bits: string[] = [];
  const goal = data.slides.find((s): s is GoalSlide => s.type === 'goal');
  const funnel = data.slides.find((s): s is FunnelSlide => s.type === 'funnel');
  const cel = data.slides.find((s): s is CelebrationSlide => s.type === 'celebration');
  const bday = data.slides.find((s): s is BirthdaysSlide => s.type === 'birthdays');
  const hire = data.slides.find((s): s is NewHireSlide => s.type === 'newhire');

  if (goal?.metaValor != null) {
    const falta = Math.max(goal.metaValor - goal.atual, 0);
    bits.push(`🎯 Faltam <b>${fmtBRL(falta)}</b> para bater a meta do mês`);
  }
  if (goal) {
    bits.push(`💳 <b>${fmtBRL(goal.creditoAprovado)}</b> em crédito aprovado no mês`);
  }
  if (funnel) {
    bits.push(`🔥 <b>${fmtBRL(funnel.quenteTotal)}</b> em negócios quentes no pipeline`);
  }
  if (cel) {
    bits.push(`🎉 <b>${cel.who}</b> ativou <b>${cel.client}</b> — ${cel.amount}`);
  }
  if (bday && bday.people.length > 0) {
    bits.push(`🎂 <b>${bday.people.length}</b> aniversários este mês`);
  }
  if (hire) {
    bits.push(`👋 Boas-vindas, <b>${hire.name}</b>!`);
  }
  return bits.length ? bits : ['📺 TV Comercial Vixtra'];
}
