'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BusinessType } from '@/lib/api/central.api';
import type { Plan } from '@/types';
import {
  BarChart3, ShoppingCart, Package, Users, FileText, Landmark,
  Zap, Shield, Globe, CheckCircle2, ArrowRight, Building2,
  TrendingUp, Clock, HeadphonesIcon, Sparkles, Menu, X,
  Store, UtensilsCrossed, Pill, ShoppingBag, Wrench, Hammer, Scissors, PawPrint, Shirt,
} from 'lucide-react';

/* ─── Design tokens ────────────────────────────────────────────────────────── */
const C = {
  bg:       '#0b1528',
  bgCard:   'rgba(255,255,255,0.055)',
  border:   'rgba(255,255,255,0.10)',
  borderHi: 'rgba(255,255,255,0.18)',
  magenta:  '#e91e8c',
  cyan:     '#00c2ff',
  purple:   '#9b5de5',
  white:    '#ffffff',
  muted:    'rgba(255,255,255,0.58)',
  dimmer:   'rgba(255,255,255,0.30)',
  grad:     'linear-gradient(135deg,#e91e8c 0%,#9b5de5 50%,#00c2ff 100%)',
};

/* ─── Static content ───────────────────────────────────────────────────────── */
const features = [
  { icon: ShoppingCart, title: 'Punto de Venta',      desc: 'Gestiona mesas, pedidos y cobros de forma ágil con tu equipo.' },
  { icon: Package,      title: 'Inventario',           desc: 'Control de stock en tiempo real con alertas de reorden y transferencias.' },
  { icon: FileText,     title: 'Ventas & Cotizaciones', desc: 'Crea cotizaciones, convierte a órdenes y factura con un solo clic.' },
  { icon: BarChart3,    title: 'Reportes',             desc: 'Visualiza tus indicadores clave de negocio en tiempo real.' },
  { icon: Users,        title: 'Recursos Humanos',     desc: 'Gestión de empleados, nómina y vacaciones en un solo lugar.' },
  { icon: Landmark,     title: 'Caja & Finanzas',      desc: 'Aperturas y cierres de caja, control de gastos e ingresos.' },
];

const benefits = [
  { icon: Zap,            text: 'Implementación en minutos, sin instalaciones' },
  { icon: Shield,         text: 'Datos seguros con encriptación de extremo a extremo' },
  { icon: Globe,          text: 'Accede desde cualquier dispositivo, en cualquier lugar' },
  { icon: TrendingUp,     text: 'Escala con tu negocio sin costos extra por usuario' },
  { icon: Clock,          text: 'Disponible 24/7 con uptime del 99.9%' },
  { icon: HeadphonesIcon, text: 'Soporte en tiempo real por chat y correo' },
];

const stats = [
  { value: '500+',   label: 'Negocios activos' },
  { value: '99.9%',  label: 'Uptime garantizado' },
  { value: '< 2min', label: 'Tiempo de setup' },
  { value: '24/7',   label: 'Soporte disponible' },
];

const navLinks = [
  { href: '#features',  label: 'Funcionalidades' },
  { href: '#plans',     label: 'Planes' },
  { href: '#benefits',  label: 'Beneficios' },
];

const FEAT_ACCENTS = [C.magenta, C.cyan, C.purple, C.cyan, C.magenta, C.purple];
const PLAN_ACCENTS = [C.magenta, C.purple, C.cyan];
const TYPE_ACCENTS = [C.magenta, C.cyan, C.purple, C.cyan, C.magenta, C.purple, C.cyan, C.magenta];

const ICON_MAP: Record<string, React.ElementType> = {
  'building-storefront': Store,
  'cake':                UtensilsCrossed,
  'beaker':              Pill,
  'shopping-bag':        ShoppingBag,
  'wrench-screwdriver':  Wrench,
  'hammer':              Hammer,
  'scissors':            Scissors,
  'paw-print':           PawPrint,
  'shirt':               Shirt,
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
function accent(i: number, color?: string | null) {
  if (color && color !== '#64748b') return color;
  return PLAN_ACCENTS[i % 3];
}
function fmt(n: number) { return `$${n.toLocaleString('es-CO')}`; }
function getPrice(plan: Plan, billing: 'monthly' | 'annual') {
  if (billing === 'annual' && (plan.price_annual ?? 0) > 0)
    return { amount: Math.round((plan.price_annual ?? 0) / 12), suffix: '/mes · anual' };
  return { amount: plan.price, suffix: '/mes' };
}
function getSavings(plan: Plan) {
  if ((plan.annual_discount_pct ?? 0) > 0) return `${plan.annual_discount_pct}% dto`;
  if ((plan.price_annual ?? 0) > 0 && plan.price > 0) {
    const s = plan.price * 12 - (plan.price_annual ?? 0);
    if (s > 0) return `Ahorra ${fmt(Math.round(s / 1000) * 1000)}`;
  }
  return null;
}

/* ─── Sub-components ───────────────────────────────────────────────────────── */
function Orb({ color, cls }: { color: string; cls: string }) {
  return <div aria-hidden className={`l-orb ${cls}`} style={{ background: color }} />;
}

function GradText({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
      {children}
    </span>
  );
}

function EmptyPlans() {
  return (
    <div className="l-empty-plans">
      <Building2 size={36} style={{ margin: '0 auto 12px', opacity: 0.35 }} />
      <p style={{ fontSize: 15 }}>Los planes no están disponibles en este momento.</p>
      <p style={{ fontSize: 13, marginTop: 6, opacity: 0.6 }}>Intenta de nuevo en unos momentos o contáctanos.</p>
    </div>
  );
}

/* ─── Props ────────────────────────────────────────────────────────────────── */
interface Props {
  plans: Plan[];
  businessTypes: BusinessType[];
}

/* ─── Component ────────────────────────────────────────────────────────────── */
export default function LandingClient({ plans, businessTypes }: Props) {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [mobile,  setMobile]  = useState(false);

  useEffect(() => {
    const fn = () => { if (window.innerWidth >= 768) setMobile(false); };
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  return (
    <div className="l-root">

      {/* ── Global CSS ───────────────────────────────────────────────────── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .l-root {
          background: ${C.bg};
          color: ${C.white};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* ── Topbar fixed ── */
        .l-topbar {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          height: 64px;
          border-bottom: 1px solid ${C.border};
          background: rgba(11,21,40,0.88);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
        .l-topbar-inner {
          width: min(88%, 1600px);
          margin: 0 auto;
          padding: 0 24px;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .l-logo {
          font-weight: 900;
          font-size: 22px;
          background: ${C.grad};
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.5px;
          flex-shrink: 0;
        }
        .l-nav { display: flex; align-items: center; gap: 28px; }
        .l-nav a {
          color: ${C.muted};
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: color .2s;
        }
        .l-nav a:hover { color: ${C.white}; }
        .l-topbar-cta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .l-btn-ghost {
          color: ${C.muted};
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          padding: 8px 14px;
          border-radius: 8px;
          transition: background .2s, color .2s;
        }
        .l-btn-ghost:hover { background: rgba(255,255,255,0.06); color: ${C.white}; }
        .l-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: ${C.grad};
          color: ${C.white} !important;
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
          padding: 9px 20px;
          border-radius: 999px;
          box-shadow: 0 0 20px rgba(233,30,140,.35);
          transition: opacity .2s, transform .15s;
          white-space: nowrap;
        }
        .l-btn-primary:hover { opacity: .85; transform: translateY(-1px); }
        .l-hamburger {
          display: none;
          background: none;
          border: none;
          color: ${C.white};
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          transition: background .2s;
          flex-shrink: 0;
        }
        .l-hamburger:hover { background: rgba(255,255,255,0.08); }

        /* ── Mobile menu ── */
        .l-mobile-menu {
          display: none;
          position: fixed;
          top: 64px; left: 0; right: 0;
          z-index: 99;
          background: rgba(11,21,40,0.97);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid ${C.border};
          padding: 20px 24px 28px;
          flex-direction: column;
          gap: 4px;
        }
        .l-mobile-menu.open { display: flex; }
        .l-mobile-link {
          color: ${C.muted};
          text-decoration: none;
          font-size: 15px;
          font-weight: 500;
          padding: 12px 8px;
          border-radius: 8px;
          transition: background .15s, color .15s;
        }
        .l-mobile-link:hover { color: ${C.white}; background: rgba(255,255,255,0.05); }
        .l-mobile-divider { height: 1px; background: ${C.border}; margin: 8px 0; }
        .l-mobile-cta { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }

        /* ── Content offset for fixed navbar ── */
        .l-content { padding-top: 64px; }

        /* ── Orbs ── */
        .l-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: .22;
          pointer-events: none;
        }
        .l-orb-tl  { width: 500px; height: 500px; top: -100px; left: 5%; }
        .l-orb-tr  { width: 400px; height: 400px; top: -50px;  right: 0; }
        .l-orb-c   { width: 350px; height: 350px; bottom: -60px; left: 40%; }
        .l-orb-r   { width: 400px; height: 400px; top: 15%; right: -5%; opacity: .1; }
        .l-orb-bl  { width: 350px; height: 350px; bottom: -10%; left: 3%; opacity: .1; }
        .l-orb-mid { width: 500px; height: 450px; top: 5%; left: 50%; transform: translateX(-50%); opacity: .12; }
        .l-orb-cta1{ width: 600px; height: 400px; top: -30%; left: 15%; opacity: .13; }
        .l-orb-cta2{ width: 400px; height: 400px; bottom: -20%; right: 5%; opacity: .11; }

        /* ── Sections ── */
        .l-section    { padding: 104px 24px; position: relative; overflow: hidden; }
        .l-section-alt {
          padding: 104px 24px;
          position: relative; overflow: hidden;
          background: rgba(155,93,229,0.06);
          border-top: 1px solid ${C.border};
          border-bottom: 1px solid ${C.border};
        }
        .l-inner    { width: min(82%, 1480px); margin: 0 auto; position: relative; }
        .l-inner-md { width: min(78%, 1200px); margin: 0 auto; position: relative; }
        .l-inner-sm { width: min(72%, 760px);  margin: 0 auto; position: relative; }
        .l-section-title { text-align: center; margin-bottom: 60px; }
        .l-section-title h2 {
          font-size: clamp(32px, 4.5vw, 52px);
          font-weight: 800;
          letter-spacing: -1px;
          margin-bottom: 16px;
          line-height: 1.15;
        }
        .l-section-title p {
          color: ${C.muted};
          font-size: 17px;
          line-height: 1.65;
          max-width: 620px;
          margin: 0 auto;
        }

        /* ── Hero ── */
        .l-hero { padding: 116px 24px 96px; text-align: center; position: relative; overflow: hidden; }
        .l-hero-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 32px;
          background: rgba(233,30,140,0.14);
          border: 1px solid rgba(233,30,140,0.35);
          border-radius: 999px;
          padding: 8px 22px;
          font-size: 14px;
          font-weight: 600;
          color: #ff80bf;
        }
        .l-hero h1 {
          font-size: clamp(40px, 8vw, 82px);
          font-weight: 900;
          line-height: 1.05;
          letter-spacing: -2px;
          margin-bottom: 28px;
        }
        .l-hero p {
          font-size: clamp(17px, 2.2vw, 22px);
          color: ${C.muted};
          max-width: 680px;
          margin: 0 auto 44px;
          line-height: 1.6;
        }
        .l-hero-ctas { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
        .l-btn-outline {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: ${C.white};
          font-size: 18px;
          font-weight: 600;
          text-decoration: none;
          padding: 16px 36px;
          border-radius: 999px;
          border: 1px solid ${C.borderHi};
          background: rgba(255,255,255,0.05);
          transition: background .2s, border-color .2s;
        }
        .l-btn-outline:hover { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.28); }
        .l-hero-sub { margin-top: 24px; font-size: 14px; color: ${C.dimmer}; font-weight: 500; }
        .l-hero-btn-lg {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: ${C.grad};
          color: ${C.white} !important;
          font-size: 18px;
          font-weight: 700;
          text-decoration: none;
          padding: 17px 40px;
          border-radius: 999px;
          box-shadow: 0 6px 40px rgba(233,30,140,.5);
          transition: opacity .2s, transform .15s;
          letter-spacing: -0.2px;
        }
        .l-hero-btn-lg:hover { opacity: .88; transform: translateY(-2px); }

        /* ── Stats ── */
        .l-stats {
          border-top: 1px solid ${C.border};
          border-bottom: 1px solid ${C.border};
          background: rgba(255,255,255,0.02);
          padding: 48px 24px;
        }
        .l-stats-grid {
          width: min(82%, 1200px);
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
          text-align: center;
        }
        .l-stat-value {
          font-size: clamp(28px, 4.5vw, 42px);
          font-weight: 900;
          background: ${C.grad};
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .l-stat-label { font-size: 15px; color: ${C.muted}; margin-top: 8px; font-weight: 500; }

        /* ── Feature / Benefit cards ── */
        .l-grid-3  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .l-grid-3b { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .l-feat-card {
          background: ${C.bgCard};
          border: 1px solid ${C.border};
          border-radius: 20px;
          padding: 36px 32px;
          transition: background .25s, border-color .25s, transform .2s;
        }
        .l-feat-card:hover { background: rgba(255,255,255,0.08); border-color: ${C.borderHi}; transform: translateY(-3px); }
        .l-icon-box {
          display: flex; align-items: center; justify-content: center;
          width: 52px; height: 52px;
          border-radius: 14px;
          margin-bottom: 20px;
        }
        .l-feat-card h3 { font-size: 18px; font-weight: 700; margin-bottom: 10px; }
        .l-feat-card p  { font-size: 15px; color: ${C.muted}; line-height: 1.65; }
        .l-ben-card {
          display: flex; align-items: flex-start; gap: 16px;
          padding: 20px 22px;
          border-radius: 16px;
          background: ${C.bgCard};
          border: 1px solid ${C.border};
          transition: background .25s, border-color .25s;
        }
        .l-ben-card:hover { background: rgba(255,255,255,0.08); border-color: ${C.borderHi}; }
        .l-ben-icon {
          width: 40px; height: 40px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .l-ben-card span { font-size: 16px; font-weight: 500; line-height: 1.5; padding-top: 2px; }

        /* ── Plans ── */
        .l-billing-toggle {
          display: inline-flex; align-items: center; gap: 4px;
          background: rgba(255,255,255,0.05);
          border: 1px solid ${C.border};
          border-radius: 999px;
          padding: 4px;
        }
        .l-toggle-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 18px; border-radius: 999px;
          font-size: 13px; font-weight: 600;
          border: none; cursor: pointer;
          transition: background .2s, color .2s;
        }
        .l-toggle-active { background: rgba(255,255,255,0.1); color: ${C.white}; box-shadow: 0 1px 6px rgba(0,0,0,.4); }
        .l-toggle-idle   { background: transparent; color: ${C.muted}; }
        .l-toggle-badge  {
          background: linear-gradient(90deg,#e91e8c,#9b5de5);
          color: ${C.white}; font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 999px;
        }
        .l-plans-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; align-items: stretch; }
        .l-plan-card {
          position: relative; display: flex; flex-direction: column;
          border-radius: 20px; overflow: hidden;
          transition: transform .25s, box-shadow .25s;
        }
        .l-plan-card:hover { transform: translateY(-8px); }
        .l-plan-head  { padding: 32px 28px 24px; }
        .l-plan-divider { height: 1px; background: ${C.border}; margin: 0 28px; }
        .l-plan-body  { padding: 20px 28px 28px; flex: 1; display: flex; flex-direction: column; }
        .l-plan-dot   { width: 42px; height: 42px; border-radius: 12px; margin-bottom: 18px; display: flex; align-items: center; justify-content: center; }
        .l-plan-name  { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
        .l-plan-desc  { font-size: 15px; color: ${C.muted}; line-height: 1.6; }
        .l-plan-price { margin-top: 24px; display: flex; align-items: flex-end; gap: 6px; }
        .l-plan-amount { font-size: 48px; font-weight: 900; line-height: 1; }
        .l-plan-suffix { font-size: 14px; color: ${C.muted}; margin-bottom: 6px; }
        .l-plan-savings{ margin-top: 6px; font-size: 13px; font-weight: 600; }
        .l-plan-ul { list-style: none; margin: 0 0 24px; padding: 0; display: flex; flex-direction: column; gap: 12px; }
        .l-plan-li { display: flex; align-items: flex-start; gap: 10px; font-size: 15px; color: rgba(255,255,255,.88); }
        .l-plan-cta {
          margin-top: auto; display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 15px 24px; border-radius: 14px;
          font-weight: 700; font-size: 16px; text-decoration: none;
          transition: opacity .2s, transform .15s;
        }
        .l-plan-cta:hover { opacity: .88; transform: translateY(-2px); }
        .l-plan-badge {
          position: absolute; top: 18px; right: 18px;
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 700;
          border-radius: 999px; padding: 3px 10px;
        }
        .l-plan-topline { position: absolute; top: 0; left: 0; right: 0; height: 2px; }

        /* Empty plans */
        .l-empty-plans { grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: ${C.muted}; }

        /* ── Business type cards ── */
        .l-types-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .l-type-card {
          display: flex; flex-direction: column; align-items: center; gap: 14px;
          padding: 28px 18px 24px; border-radius: 20px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          text-decoration: none; color: ${C.white}; text-align: center;
          transition: transform .22s, background .22s, border-color .22s, box-shadow .22s;
          cursor: pointer;
        }
        .l-type-card:hover { transform: translateY(-5px); background: rgba(255,255,255,0.07); }
        .l-type-icon { width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .l-type-label { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.55); line-height: 1.3; }
        .l-type-name  { font-size: 15px; font-weight: 700; color: ${C.white}; line-height: 1.25; margin-top: 2px; }

        /* ── CTA section ── */
        .l-cta {
          padding: 96px 24px; text-align: center;
          position: relative; overflow: hidden;
          border-top: 1px solid ${C.border};
        }
        .l-cta h2 { font-size: clamp(26px, 4vw, 36px); font-weight: 800; letter-spacing: -0.5px; margin-bottom: 16px; line-height: 1.2; }
        .l-cta p  { color: ${C.muted}; margin-bottom: 36px; line-height: 1.65; font-size: 15px; }
        .l-cta-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 64px; height: 64px; border-radius: 20px;
          background: rgba(233,30,140,0.12);
          border: 1px solid rgba(233,30,140,0.3);
          box-shadow: 0 0 30px rgba(233,30,140,.22);
          margin-bottom: 24px;
        }

        /* ── Footer ── */
        .l-footer { border-top: 1px solid ${C.border}; padding: 40px 24px; background: rgba(0,0,0,.15); }
        .l-footer-inner {
          max-width: 1100px; margin: 0 auto;
          display: flex; flex-wrap: wrap; gap: 20px;
          align-items: center; justify-content: space-between;
        }
        .l-footer-links { display: flex; gap: 24px; flex-wrap: wrap; }
        .l-footer-links a { color: ${C.muted}; font-size: 13px; text-decoration: none; transition: color .2s; }
        .l-footer-links a:hover { color: ${C.white}; }
        .l-footer-copy { color: ${C.dimmer}; font-size: 13px; }

        /* ── RESPONSIVE ─────────────────────────────────────────── */
        @media (max-width: 1024px) {
          .l-grid-3     { grid-template-columns: repeat(2, 1fr); }
          .l-grid-3b    { grid-template-columns: repeat(2, 1fr); }
          .l-plans-grid { grid-template-columns: repeat(2, 1fr); }
          .l-stats-grid { grid-template-columns: repeat(2, 1fr); gap: 20px; }
          .l-types-grid { grid-template-columns: repeat(3, 1fr); }
          .l-orb-tl     { width: 350px; height: 350px; }
          .l-orb-tr     { width: 280px; height: 280px; }
        }
        @media (max-width: 767px) {
          .l-nav { display: none; }
          .l-topbar-cta .l-btn-ghost { display: none; }
          .l-hamburger  { display: flex; }
          .l-hero       { padding: 80px 20px 60px; }
          .l-hero-ctas  { flex-direction: column; align-items: center; }
          .l-hero-btn-lg,
          .l-btn-outline { width: 100%; max-width: 360px; justify-content: center; font-size: 16px; padding: 14px 24px; }
          .l-stats      { padding: 40px 20px; }
          .l-stats-grid { width: 100%; grid-template-columns: repeat(2, 1fr); gap: 16px; }
          .l-section,
          .l-section-alt { padding: 72px 20px; }
          .l-section-title { margin-bottom: 40px; }
          .l-inner, .l-inner-md, .l-inner-sm { width: 100%; }
          .l-grid-3     { grid-template-columns: 1fr; gap: 14px; }
          .l-grid-3b    { grid-template-columns: 1fr; gap: 12px; }
          .l-plans-grid { grid-template-columns: 1fr; gap: 20px; }
          .l-types-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .l-type-card  { padding: 22px 14px 18px; gap: 10px; }
          .l-type-icon  { width: 44px; height: 44px; border-radius: 13px; }
          .l-type-name  { font-size: 14px; }
          .l-type-card:hover { transform: none; }
          .l-plan-card:hover { transform: none; }
          .l-plan-head  { padding: 28px 24px 20px; }
          .l-plan-body  { padding: 18px 24px 24px; }
          .l-plan-divider { margin: 0 24px; }
          .l-feat-card  { padding: 24px 22px; }
          .l-cta        { padding: 72px 20px; }
          .l-footer-inner { flex-direction: column; align-items: flex-start; gap: 16px; }
          .l-footer-links { gap: 16px; }
          .l-toggle-btn { padding: 7px 14px; font-size: 12px; }
          .l-orb        { display: none; }
        }
        @media (max-width: 400px) {
          .l-topbar-inner { padding: 0 16px; }
          .l-hero         { padding: 72px 16px 52px; }
          .l-section, .l-section-alt { padding: 56px 16px; }
          .l-stats        { padding: 36px 16px; }
          .l-cta          { padding: 56px 16px; }
          .l-footer       { padding: 36px 16px; }
          .l-types-grid   { gap: 10px; }
          .l-type-card    { padding: 18px 10px 14px; }
        }
      `}</style>

      {/* ── Topbar (FIXED) ─────────────────────────────────────────────────── */}
      <header className="l-topbar">
        <div className="l-topbar-inner">
          <div className="l-logo">Atlas</div>
          <nav className="l-nav">
            {navLinks.map(({ href, label }) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
          <div className="l-topbar-cta">
            <Link href="/login" className="l-btn-ghost">Iniciar sesión</Link>
            <Link href="/register" className="l-btn-primary">Comenzar gratis</Link>
            <button className="l-hamburger" onClick={() => setMobile(!mobile)} aria-label="Menú">
              {mobile ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile menu ────────────────────────────────────────────────────── */}
      <div className={`l-mobile-menu${mobile ? ' open' : ''}`}>
        {navLinks.map(({ href, label }) => (
          <a key={href} href={href} className="l-mobile-link" onClick={() => setMobile(false)}>{label}</a>
        ))}
        <div className="l-mobile-divider" />
        <div className="l-mobile-cta">
          <Link href="/login" className="l-mobile-link" onClick={() => setMobile(false)}>Iniciar sesión</Link>
          <Link href="/register" className="l-btn-primary" onClick={() => setMobile(false)}
            style={{ justifyContent: 'center', borderRadius: 12, padding: '12px 20px' }}>
            Comenzar gratis <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="l-content">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="l-hero">
          <Orb color={C.magenta} cls="l-orb l-orb-tl" />
          <Orb color={C.cyan}    cls="l-orb l-orb-tr" />
          <Orb color={C.purple}  cls="l-orb l-orb-c"  />
          <div className="l-inner-sm" style={{ position: 'relative' }}>
            <div className="l-hero-chip">
              <Sparkles size={14} />
              El ERP #1 para negocios en Colombia
            </div>
            <h1>
              Vende más, gasta menos,{' '}
              <GradText>controla todo</GradText>
            </h1>
            <p>
              Atlas ERP centraliza ventas, inventario, finanzas y tu equipo en un solo lugar.
              Empieza hoy — sin instalaciones, sin contratos, sin complicaciones.
            </p>
            <div className="l-hero-ctas">
              <Link href="/register" className="l-hero-btn-lg">
                Pruébalo gratis 14 días <ArrowRight size={19} />
              </Link>
              <Link href="#plans" className="l-btn-outline">
                Ver planes y precios
              </Link>
            </div>
            <p className="l-hero-sub">
              Sin tarjeta de crédito · Cancela cuando quieras · Soporte incluido
            </p>
          </div>
        </section>

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        <section className="l-stats">
          <div className="l-stats-grid">
            {stats.map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div className="l-stat-value">{s.value}</div>
                <div className="l-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ───────────────────────────────────────────────────── */}
        <section id="features" className="l-section">
          <Orb color={C.cyan} cls="l-orb l-orb-r" />
          <div className="l-inner">
            <div className="l-section-title">
              <h2>Todo en uno, <GradText>desde el primer día</GradText></h2>
              <p>Deja de pagar por 5 herramientas distintas. Atlas integra todo lo que necesitas para operar y crecer.</p>
            </div>
            <div className="l-grid-3">
              {features.map(({ icon: Icon, title, desc }, i) => {
                const ac = FEAT_ACCENTS[i];
                return (
                  <div key={title} className="l-feat-card">
                    <div className="l-icon-box" style={{ background: `${ac}18`, border: `1px solid ${ac}30` }}>
                      <Icon size={20} color={ac} />
                    </div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Business Types ─────────────────────────────────────────────── */}
        {businessTypes.length > 0 && (
          <section className="l-section-alt">
            <div className="l-inner">
              <div className="l-section-title">
                <h2>Hecho para <GradText>tu industria</GradText></h2>
                <p>No es un software genérico. Atlas se configura automáticamente para tu tipo de negocio y tienes todo listo en minutos.</p>
              </div>
              <div className="l-types-grid">
                {businessTypes.map((bt, i) => {
                  const Icon = ICON_MAP[bt.icon ?? ''] ?? Store;
                  const ac   = TYPE_ACCENTS[i % TYPE_ACCENTS.length];
                  return (
                    <Link
                      key={bt.id}
                      href={`/register?type=${bt.slug}`}
                      className="l-type-card"
                      style={{ borderColor: `${ac}22` }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = `${ac}55`;
                        (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${ac}22`;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = `${ac}22`;
                        (e.currentTarget as HTMLElement).style.boxShadow = '';
                      }}
                    >
                      <div className="l-type-icon" style={{ background: `${ac}18`, border: `1px solid ${ac}35` }}>
                        <Icon size={22} color={ac} />
                      </div>
                      <div>
                        <div className="l-type-label">Sistema POS para</div>
                        <div className="l-type-name">{bt.name}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── Benefits ───────────────────────────────────────────────────── */}
        <section id="benefits" className="l-section-alt">
          <Orb color={C.magenta} cls="l-orb l-orb-bl" />
          <div className="l-inner-md">
            <div className="l-section-title">
              <h2>¿Por qué miles eligen <GradText>Atlas?</GradText></h2>
              <p>Porque crecer no debería ser complicado. Atlas te da las herramientas para vender más desde el día uno.</p>
            </div>
            <div className="l-grid-3b">
              {benefits.map(({ icon: Icon, text }, i) => {
                const ac = FEAT_ACCENTS[i];
                return (
                  <div key={text} className="l-ben-card">
                    <div className="l-ben-icon" style={{ background: `${ac}18`, border: `1px solid ${ac}28` }}>
                      <Icon size={16} color={ac} />
                    </div>
                    <span>{text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Plans ──────────────────────────────────────────────────────── */}
        <section id="plans" className="l-section">
          <Orb color={C.purple} cls="l-orb l-orb-mid" />
          <div className="l-inner">
            <div className="l-section-title">
              <h2>Precios <GradText>claros y justos</GradText></h2>
              <p style={{ marginBottom: 24 }}>Sin sorpresas. Sin letras pequeñas. Cambia o cancela cuando quieras.</p>
              <div className="l-billing-toggle">
                <button type="button"
                  className={`l-toggle-btn ${billing === 'monthly' ? 'l-toggle-active' : 'l-toggle-idle'}`}
                  onClick={() => setBilling('monthly')}>
                  Mensual
                </button>
                <button type="button"
                  className={`l-toggle-btn ${billing === 'annual' ? 'l-toggle-active' : 'l-toggle-idle'}`}
                  onClick={() => setBilling('annual')}>
                  Anual
                  <span className="l-toggle-badge">2 meses gratis</span>
                </button>
              </div>
            </div>

            <div className="l-plans-grid">
              {plans.length === 0 ? (
                <EmptyPlans />
              ) : (
                plans.map((plan, i) => {
                  const ac      = accent(i, plan.color);
                  const price   = getPrice(plan, billing);
                  const save    = billing === 'annual' ? getSavings(plan) : null;
                  const featured = !!plan.is_featured;
                  const acRgb   = ac === C.magenta ? '233,30,140' : ac === C.cyan ? '0,194,255' : '155,93,229';
                  return (
                    <div key={plan.slug} className="l-plan-card"
                      style={{
                        background: featured
                          ? `linear-gradient(160deg,rgba(${acRgb},.14) 0%,rgba(11,21,40,.95) 60%)`
                          : C.bgCard,
                        border: `1px solid ${featured ? ac + '55' : C.border}`,
                        boxShadow: featured
                          ? `0 0 40px ${ac}20,0 8px 32px rgba(0,0,0,.4)`
                          : '0 4px 24px rgba(0,0,0,.3)',
                      }}>
                      <div className="l-plan-topline"
                        style={{ background: `linear-gradient(90deg,${ac},transparent)` }} />
                      {(plan.badge_text || featured) && (
                        <div className="l-plan-badge"
                          style={{ background: `${ac}22`, color: ac, border: `1px solid ${ac}40` }}>
                          <Sparkles size={10} />
                          {plan.badge_text || 'Destacado'}
                        </div>
                      )}
                      <div className="l-plan-head">
                        <div className="l-plan-dot" style={{ background: `${ac}18`, border: `1px solid ${ac}30` }}>
                          <div style={{ width: 14, height: 14, borderRadius: '50%', background: ac, boxShadow: `0 0 10px ${ac}` }} />
                        </div>
                        <div className="l-plan-name">{plan.name}</div>
                        <div className="l-plan-desc">{plan.description}</div>
                        <div className="l-plan-price">
                          {price.amount === 0 ? (
                            <span className="l-plan-amount"
                              style={{ background: C.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                              Gratis
                            </span>
                          ) : (
                            <>
                              <span className="l-plan-amount">{fmt(price.amount)}</span>
                              <span className="l-plan-suffix">{price.suffix}</span>
                            </>
                          )}
                        </div>
                        {save && price.amount > 0 && (
                          <p className="l-plan-savings" style={{ color: ac }}>{save} al pagar anual</p>
                        )}
                        {(plan.trial_days ?? 0) > 0 && (
                          <p style={{ marginTop: 4, fontSize: 12, color: C.muted }}>
                            {plan.trial_days} días de prueba gratis
                          </p>
                        )}
                      </div>
                      <div className="l-plan-divider" />
                      <div className="l-plan-body">
                        {Array.isArray(plan.features) && plan.features.length > 0 && (
                          <ul className="l-plan-ul">
                            {(plan.features as string[]).map((f) => (
                              <li key={f} className="l-plan-li">
                                <CheckCircle2 size={15} color={ac} style={{ flexShrink: 0, marginTop: 2 }} />
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                        <Link
                          href={plan.slug ? `/register?plan=${plan.slug}&billing=${billing}` : '/register'}
                          className="l-plan-cta"
                          style={featured
                            ? { background: `linear-gradient(135deg,${ac},${C.purple})`, color: C.white, boxShadow: `0 4px 20px ${ac}44` }
                            : { background: `${ac}16`, color: ac, border: `1px solid ${ac}35` }
                          }>
                          {price.amount === 0 ? 'Comenzar gratis' : 'Quiero este plan'}
                          <ArrowRight size={15} />
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="l-cta">
          <Orb color={C.magenta} cls="l-orb l-orb-cta1" />
          <Orb color={C.cyan}    cls="l-orb l-orb-cta2" />
          <div className="l-inner-sm" style={{ position: 'relative' }}>
            <div className="l-cta-icon">
              <Building2 size={28} color={C.magenta} />
            </div>
            <h2>
              Tu negocio merece{' '}
              <GradText>herramientas de primer nivel</GradText>
            </h2>
            <p>
              Más de 500 negocios ya venden más y trabajan menos con Atlas.
              Empieza gratis hoy — en menos de 2 minutos estás operando.
            </p>
            <Link href="/register" className="l-hero-btn-lg">
              Crear mi cuenta gratis <ArrowRight size={19} />
            </Link>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="l-footer">
          <div className="l-footer-inner">
            <div className="l-logo">Atlas</div>
            <div className="l-footer-links">
              <a href="#features">Funcionalidades</a>
              <a href="#plans">Planes</a>
              <Link href="/login">Iniciar sesión</Link>
              <Link href="/register">Registrarse</Link>
            </div>
            <p className="l-footer-copy">
              © {new Date().getFullYear()} Atlas ERP. Todos los derechos reservados.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
