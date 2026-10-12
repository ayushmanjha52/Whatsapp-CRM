import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, CheckCheck, MessageSquare, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LandingPageProps {
  onGetStarted: () => void;
}

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
};

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">{children}</p>
);

/** A static, to-scale sketch of the inbox — no screenshots, so it stays sharp at any size. */
const AppPreview: React.FC = () => {
  const chats = [
    { n: 'Priya Raman', m: 'Can we lock the annual plan today?', t: '10:43', u: 2, tag: 'VIP' },
    { n: 'Daniel Okafor', m: 'Sent the PO, please confirm', t: '10:12', u: 0, tag: 'Active' },
    { n: 'Lena Fischer', m: 'Thanks, that works for us', t: '09:58', u: 0, tag: '' },
    { n: 'Arjun Mehta', m: 'Is delivery possible by Friday?', t: 'Mon', u: 1, tag: 'Follow up' }
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 h-9 border-b border-slate-200">
        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
        <span className="ml-3 font-mono text-[10px] text-slate-400">app / inbox</span>
      </div>
      <div className="grid grid-cols-12 h-[420px] text-left">
        <div className="col-span-5 md:col-span-4 border-r border-slate-200 flex flex-col">
          <div className="p-3">
            <div className="flex items-center gap-2 h-8 px-2.5 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-400">
              <Search size={12} /> Search chats
            </div>
          </div>
          {chats.map((c, i) => (
            <div key={c.n} className={`px-3 py-3 border-t border-slate-200 flex gap-2.5 ${i === 0 ? 'bg-white' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                {c.n.split(' ').map(p => p[0]).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <p className={`text-[12px] truncate ${c.u ? 'text-slate-900 font-semibold' : 'text-slate-700'}`}>{c.n}</p>
                  <span className="text-[10px] text-slate-400">{c.t}</span>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] text-slate-500 truncate flex-1">{c.m}</p>
                  {c.u > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">{c.u}</span>}
                </div>
                {c.tag && <span className="inline-block mt-1.5 text-[9px] uppercase tracking-wide text-slate-500 border border-slate-200 rounded px-1.5 py-px">{c.tag}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="col-span-7 md:col-span-5 flex flex-col chat-wallpaper">
          <div className="h-12 px-4 flex items-center gap-2.5 border-b border-slate-200 bg-slate-50">
            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold flex items-center justify-center">PR</div>
            <div>
              <p className="text-[12px] text-slate-900 font-medium leading-tight">Priya Raman</p>
              <p className="text-[10px] text-emerald-600 leading-tight">reply window open · 21h</p>
            </div>
          </div>
          <div className="flex-1 p-4 space-y-2.5 text-[12px]">
            <div className="max-w-[80%] bg-white border border-slate-200 rounded-xl rounded-bl-sm px-3 py-2 text-slate-700">
              Hi, saw the spring offer. Does it include onboarding for 5 people?
            </div>
            <div className="max-w-[80%] ml-auto bg-primary text-white rounded-xl rounded-br-sm px-3 py-2">
              It does. Onboarding is included for up to 10 seats on the annual plan.
              <span className="flex justify-end items-center gap-1 text-[9px] text-blue-100 mt-0.5">10:41 <CheckCheck size={11} /></span>
            </div>
            <div className="max-w-[80%] bg-white border border-slate-200 rounded-xl rounded-bl-sm px-3 py-2 text-slate-700">
              Perfect. Can we lock the annual plan today?
            </div>
          </div>
          <div className="m-3 h-9 rounded-lg bg-slate-50 border border-slate-200 px-3 flex items-center text-[11px] text-slate-400">Type a message</div>
        </div>
        <div className="hidden md:flex md:col-span-3 border-l border-slate-200 p-4 flex-col gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400 mb-1.5">Pipeline</p>
            <p className="text-[12px] text-slate-900">Active · <span className="tabular">$4,800</span></p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400 mb-1.5">Notes</p>
            <p className="text-[11px] text-slate-600 leading-relaxed">Decision maker. Wants onboarding for the sales team before Q3.</p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400 mb-1.5">Reminder</p>
            <p className="text-[11px] text-slate-600">Send quote · today 4 pm</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const FEATURES = [
  {
    n: '01',
    title: 'One inbox for the whole team',
    body: 'Every WhatsApp chat lands in a shared, real-time inbox with read receipts, media, notes, tags and reminders. The composer knows about WhatsApp’s 24-hour reply window and offers an approved template when it closes.'
  },
  {
    n: '02',
    title: 'A pipeline that stays in sync',
    body: 'Drag deals across stages and see value, win rate and time to close. Adding a deal puts the contact in the inbox; inbound-only leads stay out of the pipeline until you decide.'
  },
  {
    n: '03',
    title: 'Broadcasts you can measure',
    body: 'Send approved templates to a tagged list with per-contact fields, schedule or cancel, then follow the sent → delivered → read → replied funnel. Follow up only with the people who didn’t answer.'
  },
  {
    n: '04',
    title: 'Templates without the guesswork',
    body: 'Write templates with variables, media headers and link buttons, preview them like a phone would, and get Meta’s approval status the moment it changes.'
  },
  {
    n: '05',
    title: 'Roles, reminders and drafts',
    body: 'Admins and agents see what they should. Reminders ping you when they’re due, and reply drafts help agents answer faster — they always edit and send themselves.'
  },
  {
    n: '06',
    title: 'Numbers that mean something',
    body: 'First-reply time, conversation volume, pipeline health and campaign results on one dashboard — computed from your own data, not estimates.'
  }
];

const PLANS = [
  { name: 'Starter', price: 0, blurb: 'For one person getting started.', items: ['100 conversations / month', '1 seat', 'Inbox, pipeline, reminders'] },
  { name: 'Growth', price: 29, blurb: 'For small teams that broadcast.', items: ['Unlimited conversations', '3 seats', 'Broadcasts & follow-ups'], featured: true },
  { name: 'Business', price: 79, blurb: 'For teams that live in WhatsApp.', items: ['Unlimited seats', 'Reply drafts', 'Everything in Growth'] }
];

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => (
  <div className="grain min-h-screen bg-background text-slate-800 overflow-x-hidden">
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-background/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 text-slate-900">
          <span className="w-7 h-7 rounded-md bg-primary flex items-center justify-center text-white">
            <MessageSquare size={15} />
          </span>
          <span className="font-display text-[22px] leading-none">WhatsApp CRM</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-500">
          <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
          <a href="#how" className="hover:text-slate-900 transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-slate-900 transition-colors">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="hidden sm:inline-flex h-9 items-center px-3.5 text-sm text-slate-700 hover:text-slate-900">Sign in</Link>
          <button onClick={onGetStarted} className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-colors">
            Start free
          </button>
        </div>
      </div>
    </header>

    <main>
      <section className="relative">
        <div className="absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(200,242,107,0.10),transparent_60%)] pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 pt-20 md:pt-28 pb-16 text-center animate-in fade-in slide-in-from-bottom-3 duration-700">
          <Eyebrow>WhatsApp Business · Cloud API</Eyebrow>
          <h1 className="mt-6 font-display text-[56px] sm:text-[76px] md:text-[96px] leading-[0.95] text-slate-900">
            Sell in WhatsApp
            <br />
            like a <em className="text-primary">real team</em>.
          </h1>
          <p className="mt-7 max-w-xl mx-auto text-lg text-slate-500 leading-relaxed">
            A shared inbox, a deals pipeline and broadcasts that track all the way to the reply — for teams whose customers would rather text than email.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={onGetStarted} className="h-12 px-6 rounded-xl bg-primary text-white font-semibold inline-flex items-center gap-2 hover:bg-primary-hover transition-colors">
              Start free <ArrowRight size={17} />
            </button>
            <Link to="/login" className="h-12 px-6 rounded-xl border border-slate-200 text-slate-900 inline-flex items-center gap-2 hover:bg-slate-100 transition-colors">
              Sign in to your workspace
            </Link>
          </div>
        </div>
        <div className="relative max-w-6xl mx-auto px-6 pb-24 animate-in fade-in slide-in-from-bottom-6 duration-1000">
          <AppPreview />
        </div>
      </section>

      <section className="border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4">
          {[
            ['24h', 'reply-window aware composer'],
            ['4 steps', 'sent · delivered · read · replied'],
            ['2 roles', 'admin and agent permissions'],
            ['Live', 'updates across every open tab']
          ].map(([k, v], i) => (
            <div key={k} className={`py-8 px-2 md:px-6 ${i > 0 ? 'md:border-l' : ''} ${i % 2 === 1 ? 'border-l md:border-l' : ''} border-slate-200`}>
              <p className="font-display text-4xl text-slate-900">{k}</p>
              <p className="mt-1 text-sm text-slate-500">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 py-28">
        <motion.div {...reveal} className="max-w-2xl">
          <Eyebrow>What’s inside</Eyebrow>
          <h2 className="mt-5 font-display text-5xl md:text-6xl leading-[1.02] text-slate-900">
            Everything a chat-first sales team needs, <em className="text-slate-500">nothing it doesn’t.</em>
          </h2>
        </motion.div>
        <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 border-t border-l border-slate-200">
          {FEATURES.map(f => (
            <motion.article key={f.n} {...reveal} className="p-8 border-r border-b border-slate-200 group">
              <p className="font-mono text-xs text-primary">{f.n}</p>
              <h3 className="mt-6 font-display text-[28px] leading-tight text-slate-900">{f.title}</h3>
              <p className="mt-3 text-[15px] text-slate-500 leading-relaxed">{f.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section id="how" className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-28 grid lg:grid-cols-[1fr_1.4fr] gap-16">
          <motion.div {...reveal}>
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-5 font-display text-5xl leading-[1.02] text-slate-900">Up and running before your coffee cools.</h2>
          </motion.div>
          <ol className="space-y-10">
            {[
              ['Connect your number', 'Sign in with Facebook or paste a permanent token. Webhooks and templates are set up for you.'],
              ['Let the chats come in', 'Every message, delivery receipt and template approval appears live for the whole team.'],
              ['Close from the conversation', 'Add a deal, set a reminder or send a template without leaving the chat.']
            ].map(([t, b], i) => (
              <motion.li key={t} {...reveal} className="grid grid-cols-[56px_1fr] gap-4">
                <span className="font-display text-5xl text-slate-300 leading-none">{i + 1}</span>
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-lg text-slate-900 font-medium">{t}</p>
                  <p className="mt-1.5 text-slate-500 leading-relaxed">{b}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="max-w-6xl mx-auto px-6 py-28">
        <motion.div {...reveal} className="text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-5 font-display text-5xl md:text-6xl text-slate-900">Simple, monthly, <em className="text-primary">fair</em>.</h2>
        </motion.div>
        <div className="mt-16 grid md:grid-cols-3 gap-4">
          {PLANS.map(p => (
            <motion.div
              key={p.name}
              {...reveal}
              className={`rounded-2xl p-8 flex flex-col ${p.featured ? 'bg-slate-900 text-ink' : 'border border-slate-200 bg-white'}`}
            >
              <p className={`text-sm font-medium ${p.featured ? 'text-ink/70' : 'text-slate-500'}`}>{p.name}</p>
              <p className={`mt-4 font-display text-6xl ${p.featured ? 'text-ink' : 'text-slate-900'}`}>
                ${p.price}<span className={`font-sans text-base ${p.featured ? 'text-ink/60' : 'text-slate-500'}`}> /month</span>
              </p>
              <p className={`mt-2 text-sm ${p.featured ? 'text-ink/70' : 'text-slate-500'}`}>{p.blurb}</p>
              <ul className="mt-8 space-y-3 flex-1">
                {p.items.map(it => (
                  <li key={it} className="flex items-start gap-2.5 text-[15px]">
                    <Check size={17} className={`mt-0.5 flex-shrink-0 ${p.featured ? 'text-ink' : 'text-primary'}`} />
                    <span className={p.featured ? 'text-ink' : 'text-slate-700'}>{it}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={onGetStarted}
                className={`mt-10 h-11 rounded-xl font-semibold text-sm transition-colors ${
                  p.featured ? 'bg-ink text-slate-900 hover:bg-black' : 'border border-slate-200 text-slate-900 hover:bg-slate-100'
                }`}
              >
                {p.price === 0 ? 'Start free' : `Choose ${p.name}`}
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200">
        <motion.div {...reveal} className="max-w-6xl mx-auto px-6 py-28 flex flex-col md:flex-row md:items-end justify-between gap-10">
          <h2 className="font-display text-5xl md:text-7xl leading-[0.98] text-slate-900 max-w-3xl">
            Your customers are already texting. <em className="text-primary">Answer like a team.</em>
          </h2>
          <button onClick={onGetStarted} className="h-12 px-6 rounded-xl bg-primary text-white font-semibold inline-flex items-center gap-2 hover:bg-primary-hover transition-colors self-start md:self-auto">
            Start free <ArrowRight size={17} />
          </button>
        </motion.div>
      </section>
    </main>

    <footer className="border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-10 text-sm text-slate-500">
        <p>© {new Date().getFullYear()} WhatsApp CRM. Not affiliated with WhatsApp or Meta.</p>
      </div>
    </footer>
  </div>
);
