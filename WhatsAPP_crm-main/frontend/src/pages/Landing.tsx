
import React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { MessageSquare, Check, ArrowRight, Zap, Users, BarChart3, Shield, Play, Clock, Activity, Globe, Command, LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LandingPageProps {
  onGetStarted: () => void;
}

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

const LogoMarquee = () => {
  const logos = [
    { name: 'Bolt', icon: Zap },
    { name: 'Acme', icon: Command },
    { name: 'Global', icon: Globe },
    { name: 'Square', icon: Activity },
    { name: 'Nexus', icon: Users },
    { name: 'Vertex', icon: BarChart3 },
  ];

  return (
    <div className="relative flex overflow-hidden py-10 group">
      <div className="flex animate-marquee whitespace-nowrap gap-20 group-hover:[animation-play-state:paused]">
        {[...logos, ...logos, ...logos, ...logos].map((logo, i) => (
          <div key={i} className="flex items-center gap-3 opacity-40 hover:opacity-100 transition-opacity duration-300 cursor-default">
            <logo.icon size={28} className="text-slate-900" />
            <span className="text-2xl font-display font-bold text-slate-900">{logo.name}</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white to-transparent z-10"></div>
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white to-transparent z-10"></div>
    </div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 200]);
  const y2 = useTransform(scrollY, [0, 500], [0, -150]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans overflow-x-hidden selection:bg-blue-200 selection:text-blue-900">
      
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-10%] w-[800px] h-[800px] bg-blue-200/30 rounded-full blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.5, 1],
            rotate: [0, -90, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-200/30 rounded-full blur-[120px]" 
        />
      </div>

      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/70 backdrop-blur-xl border-b border-white/50 supports-[backdrop-filter]:bg-white/60">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <MessageSquare size={22} fill="currentColor" className="text-white/20" />
              <MessageSquare size={22} className="absolute" />
            </div>
            <span className="font-display font-bold text-xl text-slate-900 tracking-tight">WhatsApp CRM</span>
          </div>
          <div className="hidden md:flex items-center space-x-8 text-sm font-bold text-slate-500">
            <a href="#features" className="hover:text-primary transition-colors">Features</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Pricing</a>
            <Link to="/login" className="hover:text-primary transition-colors">Sign in</Link>
            <button
              onClick={onGetStarted}
              className="px-6 py-2.5 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 hover:shadow-slate-900/20 active:scale-95 transform"
            >
              Start Free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 relative">
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-8"
          >
            <motion.h1 variants={fadeInUp} className="font-display font-bold text-6xl md:text-8xl text-slate-900 tracking-tight leading-[1.05] max-w-5xl mx-auto">
              Turn WhatsApp into a <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 animate-gradient-x">Sales Machine.</span>
            </motion.h1>

            <motion.p variants={fadeInUp} className="text-xl md:text-2xl text-slate-500 font-medium max-w-2xl mx-auto leading-relaxed">
              One shared inbox. Automated follow-ups. Visual pipelines.
              Stop juggling chats and start closing deals with the CRM built for humans.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
              <button 
                onClick={onGetStarted}
                className="group px-8 py-4 bg-primary text-white font-bold text-lg rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/30 flex items-center gap-2 hover:-translate-y-1"
              >
                <span>Start Free Trial</span>
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="px-8 py-4 bg-white text-slate-700 font-bold text-lg rounded-2xl hover:bg-slate-50 border border-slate-200 transition-all flex items-center gap-2 hover:shadow-lg hover:-translate-y-1">
                <Play size={20} fill="currentColor" className="text-slate-900" />
                <span>Watch Demo</span>
              </button>
            </motion.div>
          </motion.div>

          {/* Hero Dashboard Mockup - Parallax & Floating */}
          <motion.div 
            style={{ y: y1 }}
            initial={{ opacity: 0, scale: 0.95, rotateX: 20 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 1.2, delay: 0.2, type: 'spring' }}
            className="mt-24 relative mx-auto max-w-6xl perspective-1000"
          >
            <div className="relative rounded-[2.5rem] overflow-hidden border-8 border-slate-900/90 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] bg-slate-50 aspect-[16/9] group flex">
               
               {/* 1. Fake Sidebar */}
               <div className="w-24 bg-slate-900 flex flex-col items-center py-8 gap-8 shrink-0 relative z-10">
                 <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
                    <MessageSquare size={24} className="text-white" />
                 </div>
                 {[LayoutDashboard, MessageSquare, Users, Activity].map((Icon, i) => (
                    <div key={i} className={`w-10 h-10 rounded-xl flex items-center justify-center ${i === 1 ? 'bg-white/10 text-white' : 'text-slate-500'}`}>
                        <Icon size={20} />
                    </div>
                 ))}
                 <div className="mt-auto w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-700"></div>
               </div>

               {/* 2. Fake Inbox List */}
               <div className="w-80 bg-white border-r border-slate-200 flex flex-col hidden md:flex relative z-10">
                  <div className="p-6 border-b border-slate-100">
                     <h3 className="font-bold text-xl text-slate-900 mb-4">Inbox</h3>
                     <div className="h-10 bg-slate-100 rounded-xl w-full" />
                  </div>
                  <div className="flex-1 p-4 space-y-2 overflow-hidden">
                     {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`flex gap-4 p-4 rounded-2xl transition-all ${i === 2 ? 'bg-blue-50 border border-blue-100 shadow-sm' : 'border border-transparent'}`}>
                           <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0 relative">
                              {i < 3 && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>}
                           </div>
                           <div className="flex-1 space-y-2">
                              <div className="flex justify-between items-center">
                                 <div className="h-2.5 w-24 bg-slate-300 rounded-full" />
                                 <div className="h-2 w-8 bg-slate-200 rounded-full" />
                              </div>
                              <div className="h-2 w-3/4 bg-slate-100 rounded-full" />
                              <div className="flex gap-2 mt-1">
                                 <div className={`h-1.5 w-8 rounded-full ${i===2 ? 'bg-blue-200' : 'bg-slate-100'}`}></div>
                                 <div className={`h-1.5 w-6 rounded-full ${i===2 ? 'bg-blue-200' : 'bg-slate-100'}`}></div>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

               {/* 3. Fake Chat Area */}
               <div className="flex-1 bg-[#F0F2F5] flex flex-col relative font-sans">
                  {/* Chat Header */}
                  <div className="h-20 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center px-8 justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200" />
                        <div className="space-y-1.5">
                           <div className="h-3 w-32 bg-slate-800 rounded-full" />
                           <div className="h-2 w-16 bg-emerald-100 text-emerald-600 rounded-full" />
                        </div>
                     </div>
                     <div className="flex gap-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg"></div>
                        <div className="w-8 h-8 bg-slate-100 rounded-lg"></div>
                     </div>
                  </div>

                  {/* Chat Bubbles */}
                  <div className="flex-1 p-8 space-y-8 overflow-hidden relative">
                     {/* Incoming */}
                     <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 mt-auto shrink-0" />
                        <div className="bg-white p-5 rounded-2xl rounded-bl-none shadow-sm max-w-md space-y-3">
                           <div className="h-2 w-48 bg-slate-200 rounded-full" />
                           <div className="h-2 w-32 bg-slate-200 rounded-full" />
                        </div>
                     </div>
                     
                     {/* Outbound */}
                     <div className="flex gap-4 justify-end">
                        <div className="bg-blue-600 p-5 rounded-2xl rounded-br-none shadow-sm max-w-md space-y-3">
                           <div className="h-2 w-56 bg-white/40 rounded-full" />
                           <div className="h-2 w-24 bg-white/40 rounded-full" />
                           <div className="h-2 w-40 bg-white/40 rounded-full" />
                        </div>
                     </div>

                     {/* Incoming Reply */}
                     <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 mt-auto shrink-0" />
                        <div className="bg-white p-5 rounded-2xl rounded-bl-none shadow-sm max-w-md space-y-3">
                           <div className="h-2 w-40 bg-slate-200 rounded-full" />
                        </div>
                     </div>
                  </div>
                  
                  {/* Input Mockup */}
                  <div className="p-6 bg-white border-t border-slate-200">
                     <div className="h-14 bg-slate-50 border border-slate-200 rounded-2xl flex items-center px-4 justify-between">
                        <div className="h-3 w-32 bg-slate-200 rounded-full"></div>
                        <div className="w-8 h-8 bg-blue-600 rounded-xl shadow-sm"></div>
                     </div>
                  </div>
               </div>
               
               {/* Floating UI Overlay Mockups */}
               <motion.div 
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.8, duration: 0.8 }}
                  className="absolute bottom-12 left-10 right-10 top-24 pointer-events-none"
               >
                  {/* Glass Card Overlay: "Incoming Lead" */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-xl border border-white/40 p-8 rounded-[2rem] shadow-2xl max-w-lg w-full ring-1 ring-black/5 animate-in fade-in zoom-in duration-700">
                     <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/20">
                          <MessageSquare size={28} fill="currentColor" />
                        </div>
                        <div>
                           <h3 className="text-slate-900 font-bold text-xl">Incoming Lead</h3>
                           <p className="text-slate-500 font-medium">Sarah just messaged you</p>
                        </div>
                        <span className="ml-auto text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full uppercase tracking-wide">New Deal</span>
                     </div>
                     <div className="bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-100">
                        <p className="text-slate-700 font-medium text-lg leading-snug">"Hi! I'm interested in the <span className="text-blue-600 font-bold">Enterprise plan</span>. Can we book a demo for next Tuesday?"</p>
                     </div>
                     <div className="flex gap-4">
                        <button className="flex-1 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20">Reply Now</button>
                        <button className="flex-1 py-3.5 bg-white text-slate-700 border border-slate-200 font-bold rounded-xl hover:bg-slate-50 transition-colors">Assign to Sales</button>
                     </div>
                  </div>
               </motion.div>
            </div>
            
            {/* Glow effect */}
            <div className="absolute -inset-10 bg-gradient-to-tr from-blue-500/30 to-purple-500/30 blur-[80px] -z-10 rounded-[4rem]"></div>
          </motion.div>
        </div>
      </section>

      {/* Infinite Marquee Section */}
      <section className="py-12 bg-white border-y border-slate-200/50 overflow-hidden">
         <div className="text-center mb-8">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em]">Trusted by 10,000+ teams</p>
         </div>
         <LogoMarquee />
      </section>

      {/* Pain Points Section - Interactive Cards */}
      <section className="py-32 bg-slate-50 relative overflow-hidden">
         {/* Decoration */}
         <div className="absolute right-0 top-1/4 w-1/3 h-1/3 bg-rose-200/20 blur-[100px] rounded-full"></div>

         <div className="max-w-7xl mx-auto px-6 relative z-10">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center max-w-3xl mx-auto mb-20"
            >
               <h2 className="font-display font-bold text-4xl md:text-5xl text-slate-900 mb-6">Why your WhatsApp is a mess</h2>
               <p className="text-xl text-slate-500 leading-relaxed">Managing business on a personal app wasn't built for scale. <br/>We fixed the chaos so you can focus on selling.</p>
            </motion.div>
            
            <div className="grid md:grid-cols-3 gap-8">
               {[
                  { title: "Unread Chaos", desc: "Important leads get buried under family groups and spam.", icon: MessageSquare, color: "text-rose-500", gradient: "from-rose-500 to-pink-500", bg: "bg-rose-50" },
                  { title: "Zero Follow-up", desc: "You forget to reply, and the lead goes cold forever.", icon: Clock, color: "text-amber-500", gradient: "from-amber-500 to-orange-500", bg: "bg-amber-50" },
                  { title: "No Visibility", desc: "You have no idea if your team is replying to customers.", icon: Shield, color: "text-blue-500", gradient: "from-blue-500 to-cyan-500", bg: "bg-blue-50" },
               ].map((item, i) => (
                  <motion.div 
                     key={i}
                     initial={{ opacity: 0, y: 30 }}
                     whileInView={{ opacity: 1, y: 0 }}
                     viewport={{ once: true }}
                     transition={{ delay: i * 0.2, duration: 0.5 }}
                     whileHover={{ y: -10, transition: { duration: 0.2 } }}
                     className="bg-white p-10 rounded-[2.5rem] shadow-lg shadow-slate-200/50 border border-slate-100 hover:shadow-2xl hover:shadow-blue-500/10 transition-all group relative overflow-hidden"
                  >
                     <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-10 rounded-bl-[100%] transition-opacity duration-500`}></div>
                     
                     <div className={`w-16 h-16 ${item.bg} rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300`}>
                        <item.icon size={32} className={`${item.color}`} />
                     </div>
                     <h3 className="font-display font-bold text-2xl text-slate-900 mb-4">{item.title}</h3>
                     <p className="text-slate-500 text-lg leading-relaxed font-medium">{item.desc}</p>
                  </motion.div>
               ))}
            </div>
         </div>
      </section>

      {/* Features Section - Bento / Split */}
      <section id="features" className="py-32 bg-white overflow-hidden">
         <div className="max-w-7xl mx-auto px-6 space-y-40">
            
            {/* Feature 1 */}
            <motion.div 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="flex flex-col md:flex-row items-center gap-20"
            >
               <div className="flex-1 space-y-10">
                  <div className="inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">
                     <Users size={14} /> <span>Unified Inbox</span>
                  </div>
                  <h2 className="font-display font-bold text-5xl text-slate-900 leading-[1.1]">
                     One inbox for <br/> your entire team.
                  </h2>
                  <p className="text-xl text-slate-500 font-medium leading-relaxed">
                     No more sharing phones. Your team logs in from their own devices, picks up chats, and tags teammates. Everything stays synced.
                  </p>
                  <ul className="space-y-5">
                     {[
                        "Assign chats to specific agents",
                        "Internal notes your customers can't see",
                        "See who is typing in real-time"
                     ].map((feat, i) => (
                        <motion.li 
                          key={i} 
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.2 + (i * 0.1) }}
                          className="flex items-center gap-4 text-slate-700 font-bold text-lg"
                        >
                           <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center flex-shrink-0"><Check size={16} strokeWidth={3} /></div>
                           {feat}
                        </motion.li>
                     ))}
                  </ul>
               </div>
               <motion.div 
                  style={{ y: y2 }}
                  className="flex-1 relative"
               >
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-200 to-indigo-100 rounded-full blur-[80px] opacity-60"></div>
                  {/* High quality feature image */}
                  <img 
                    src="https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=2940&auto=format&fit=crop" 
                    className="relative rounded-3xl shadow-2xl border-4 border-white transform rotate-2 hover:rotate-0 transition-transform duration-700" 
                    alt="Team Collaboration" 
                  />
                  {/* Floating badge */}
                  <div className="absolute -bottom-10 -left-10 bg-white p-4 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-4 animate-bounce duration-[3000ms]">
                    <div className="flex -space-x-4">
                      <img src="https://i.pravatar.cc/100?img=1" className="w-10 h-10 rounded-full border-2 border-white" alt=""/>
                      <img src="https://i.pravatar.cc/100?img=2" className="w-10 h-10 rounded-full border-2 border-white" alt=""/>
                      <img src="https://i.pravatar.cc/100?img=3" className="w-10 h-10 rounded-full border-2 border-white" alt=""/>
                    </div>
                    <div className="text-sm font-bold">
                      <p className="text-slate-900">Team Active</p>
                      <p className="text-emerald-500">3 Online now</p>
                    </div>
                  </div>
               </motion.div>
            </motion.div>

            {/* Feature 2 */}
            <motion.div 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="flex flex-col md:flex-row-reverse items-center gap-20"
            >
               <div className="flex-1 space-y-10">
                  <div className="inline-flex items-center space-x-2 bg-amber-50 text-amber-600 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">
                     <BarChart3 size={14} /> <span>Visual Pipeline</span>
                  </div>
                  <h2 className="font-display font-bold text-5xl text-slate-900 leading-[1.1]">
                     Stop losing leads <br/> in the scroll.
                  </h2>
                  <p className="text-xl text-slate-500 font-medium leading-relaxed">
                     Move customers from "New" to "Won" with a drag-and-drop board. See exactly how much revenue is stuck in your WhatsApp.
                  </p>
                  <button className="text-primary font-bold text-lg flex items-center gap-2 hover:gap-4 transition-all group">
                     Explore Pipelines <ArrowRight size={20} className="group-hover:text-blue-700" />
                  </button>
               </div>
               <div className="flex-1 relative">
                  <div className="absolute inset-0 bg-gradient-to-bl from-amber-200 to-orange-100 rounded-full blur-[80px] opacity-60"></div>
                  <div className="relative bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 transform -rotate-1 hover:rotate-0 transition-transform duration-500">
                     {/* CSS Drawn Kanban Board */}
                     <div className="flex gap-6">
                        <div className="w-1/3 bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-4">
                           <div className="w-full h-8 bg-blue-100 rounded-lg mb-2"></div>
                           <div className="w-full h-24 bg-white rounded-xl shadow-sm border border-slate-200/60 p-3 space-y-2">
                              <div className="w-12 h-12 rounded-full bg-slate-100"></div>
                              <div className="h-4 w-2/3 bg-slate-100 rounded-full"></div>
                           </div>
                           <div className="w-full h-24 bg-white rounded-xl shadow-sm border border-slate-200/60 p-3 space-y-2">
                              <div className="w-12 h-12 rounded-full bg-slate-100"></div>
                              <div className="h-4 w-1/2 bg-slate-100 rounded-full"></div>
                           </div>
                        </div>
                        <div className="w-1/3 bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-4">
                           <div className="w-full h-8 bg-amber-100 rounded-lg mb-2"></div>
                           <div className="w-full h-24 bg-white rounded-xl shadow-lg shadow-amber-500/10 border border-amber-200 p-3 space-y-2 scale-105">
                              <div className="w-12 h-12 rounded-full bg-slate-100"></div>
                              <div className="h-4 w-3/4 bg-slate-100 rounded-full"></div>
                           </div>
                        </div>
                        <div className="w-1/3 bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-4">
                           <div className="w-full h-8 bg-emerald-100 rounded-lg mb-2"></div>
                           <div className="w-full h-24 bg-white rounded-xl shadow-sm border border-slate-200/60 p-3 space-y-2 opacity-50"></div>
                        </div>
                     </div>
                  </div>
               </div>
            </motion.div>

         </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-32 bg-slate-900 text-white relative overflow-hidden">
         {/* Background Elements */}
         <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[-20%] left-[-10%] w-[1000px] h-[1000px] bg-blue-600/20 rounded-full blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[1000px] h-[1000px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
         </div>

         <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="text-center max-w-2xl mx-auto mb-20">
               <h2 className="font-display font-bold text-5xl mb-6">Simple, transparent pricing</h2>
               <p className="text-slate-400 text-xl">Start for free, scale as you grow. No hidden fees.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 items-center">
               
               {/* Starter */}
               <motion.div 
                 initial={{ opacity: 0, y: 20 }}
                 whileInView={{ opacity: 1, y: 0 }}
                 viewport={{ once: true }}
                 transition={{ delay: 0, duration: 0.5 }}
                 className="bg-slate-800/50 backdrop-blur-md border border-slate-700/50 p-10 rounded-[2rem] hover:bg-slate-800 transition-all hover:-translate-y-2"
               >
                  <h3 className="font-bold text-2xl mb-2 text-slate-200">Starter</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                     <span className="text-5xl font-display font-bold">$0</span>
                     <span className="text-slate-400">/mo</span>
                  </div>
                  <p className="text-slate-400 text-base mb-8 font-medium">Perfect for solopreneurs getting started.</p>
                  <button onClick={onGetStarted} className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors mb-8">Start Free</button>
                  <ul className="space-y-4 text-sm font-medium text-slate-300">
                     <li className="flex items-center gap-3"><Check size={18} className="text-emerald-400" /> 100 Conversations/mo</li>
                     <li className="flex items-center gap-3"><Check size={18} className="text-emerald-400" /> 1 User Seat</li>
                     <li className="flex items-center gap-3"><Check size={18} className="text-emerald-400" /> Basic Inbox</li>
                  </ul>
               </motion.div>

               {/* Growth (Highlighted) */}
               <motion.div 
                 initial={{ opacity: 0, y: 20 }}
                 whileInView={{ opacity: 1, y: 0 }}
                 viewport={{ once: true }}
                 transition={{ delay: 0.2, duration: 0.5 }}
                 className="bg-gradient-to-b from-blue-600 to-indigo-700 p-10 rounded-[2rem] shadow-2xl shadow-blue-900/50 transform md:-translate-y-4 relative border border-blue-400/30"
               >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wide shadow-lg">
                     Most Popular
                  </div>
                  <h3 className="font-bold text-2xl mb-2">Growth</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                     <span className="text-6xl font-display font-bold">$29</span>
                     <span className="text-blue-200">/mo</span>
                  </div>
                  <p className="text-blue-100 text-base mb-8 font-medium">For growing teams needing automation.</p>
                  <button onClick={onGetStarted} className="w-full py-4 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-colors mb-8 shadow-lg">Get Started</button>
                  <ul className="space-y-5 text-sm font-bold text-white">
                     <li className="flex items-center gap-3"><div className="bg-blue-500/50 rounded-full p-1"><Check size={14} strokeWidth={4} /></div> Unlimited Conversations</li>
                     <li className="flex items-center gap-3"><div className="bg-blue-500/50 rounded-full p-1"><Check size={14} strokeWidth={4} /></div> 3 Team Members</li>
                     <li className="flex items-center gap-3"><div className="bg-blue-500/50 rounded-full p-1"><Check size={14} strokeWidth={4} /></div> Automated Follow-ups</li>
                     <li className="flex items-center gap-3"><div className="bg-blue-500/50 rounded-full p-1"><Check size={14} strokeWidth={4} /></div> Broadcasts</li>
                  </ul>
               </motion.div>

               {/* Enterprise */}
               <motion.div 
                 initial={{ opacity: 0, y: 20 }}
                 whileInView={{ opacity: 1, y: 0 }}
                 viewport={{ once: true }}
                 transition={{ delay: 0.4, duration: 0.5 }}
                 className="bg-slate-800/50 backdrop-blur-md border border-slate-700/50 p-10 rounded-[2rem] hover:bg-slate-800 transition-all hover:-translate-y-2"
               >
                  <h3 className="font-bold text-2xl mb-2 text-slate-200">Business</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                     <span className="text-5xl font-display font-bold">$79</span>
                     <span className="text-slate-400">/mo</span>
                  </div>
                  <p className="text-slate-400 text-base mb-8 font-medium">Advanced features for power users.</p>
                  <button onClick={onGetStarted} className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors mb-8">Contact Sales</button>
                  <ul className="space-y-4 text-sm font-medium text-slate-300">
                     <li className="flex items-center gap-3"><Check size={18} className="text-emerald-400" /> Unlimited Team Members</li>
                     <li className="flex items-center gap-3"><Check size={18} className="text-emerald-400" /> Advanced Analytics</li>
                     <li className="flex items-center gap-3"><Check size={18} className="text-emerald-400" /> AI Auto-Replies</li>
                  </ul>
               </motion.div>

            </div>
         </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 bg-white relative overflow-hidden">
         <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50"></div>
         <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
            <motion.div
               initial={{ scale: 0.9, opacity: 0 }}
               whileInView={{ scale: 1, opacity: 1 }}
               transition={{ duration: 0.8 }}
            >
              <h2 className="font-display font-bold text-5xl md:text-6xl text-slate-900 mb-8 tracking-tight leading-tight">
                 Ready to make WhatsApp your <br/> most powerful sales tool?
              </h2>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button onClick={onGetStarted} className="px-10 py-5 bg-primary text-white font-bold text-xl rounded-2xl hover:bg-blue-700 shadow-xl shadow-blue-500/30 transition-all transform hover:-translate-y-1">
                  Start 14-Day Free Trial
                </button>
              </div>
              <p className="mt-8 text-slate-400 font-medium">No credit card required. Cancel anytime.</p>
            </motion.div>
         </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-50 border-t border-slate-200 pt-20 pb-10">
         <div className="max-w-7xl mx-auto px-6">
            <div className="grid md:grid-cols-4 gap-12 mb-16">
               <div className="col-span-1 md:col-span-1">
                  <div className="flex items-center space-x-3 mb-6">
                     <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                        <MessageSquare size={22} fill="currentColor" />
                     </div>
                     <span className="font-display font-bold text-xl text-slate-900">WhatsApp CRM</span>
                  </div>
                  <p className="text-slate-500 font-medium leading-relaxed">The #1 CRM built for WhatsApp Business API. Sell more, stress less.</p>
               </div>
               
               <div>
                  <h4 className="font-bold text-slate-900 mb-6">Product</h4>
                  <ul className="space-y-4 text-slate-500 font-medium">
                     <li><a href="#" className="hover:text-primary transition-colors">Features</a></li>
                     <li><a href="#" className="hover:text-primary transition-colors">Pricing</a></li>
                     <li><a href="#" className="hover:text-primary transition-colors">API</a></li>
                     <li><a href="#" className="hover:text-primary transition-colors">Changelog</a></li>
                  </ul>
               </div>

               <div>
                  <h4 className="font-bold text-slate-900 mb-6">Resources</h4>
                  <ul className="space-y-4 text-slate-500 font-medium">
                     <li><a href="#" className="hover:text-primary transition-colors">Blog</a></li>
                     <li><a href="#" className="hover:text-primary transition-colors">Community</a></li>
                     <li><a href="#" className="hover:text-primary transition-colors">Help Center</a></li>
                     <li><a href="#" className="hover:text-primary transition-colors">Status</a></li>
                  </ul>
               </div>

               <div>
                  <h4 className="font-bold text-slate-900 mb-6">Company</h4>
                  <ul className="space-y-4 text-slate-500 font-medium">
                     <li><a href="#" className="hover:text-primary transition-colors">About</a></li>
                     <li><a href="#" className="hover:text-primary transition-colors">Careers</a></li>
                     <li><a href="#" className="hover:text-primary transition-colors">Legal</a></li>
                     <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
                  </ul>
               </div>
            </div>
            
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm font-medium text-slate-400 border-t border-slate-200 pt-10">
               <p>© 2024 WhatsApp CRM Inc. All rights reserved.</p>
               <div className="flex gap-8">
                  <a href="#" className="hover:text-slate-600">Privacy Policy</a>
                  <a href="#" className="hover:text-slate-600">Terms of Service</a>
               </div>
            </div>
         </div>
      </footer>
      
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .mask-image-gradient {
            mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
        }
        .perspective-1000 {
            perspective: 1000px;
        }
      `}</style>
    </div>
  );
};
