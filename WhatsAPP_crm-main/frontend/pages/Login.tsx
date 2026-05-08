import React, { useState } from 'react';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, CheckCircle2, Shield, BarChart3, MessageSquare } from 'lucide-react';
import { login as apiLogin, signup as apiSignup } from '../api/auth';

export const Login: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mock validation for UX demo
  const isEmailValid = email.includes('@') && email.includes('.');
  const isPasswordValid = password.length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (isLogin) {
        await apiLogin(email, password)
      } else {
        await apiSignup(email, password, name)
      }
      onLogin()
    } catch {
      setError(isLogin ? 'Invalid email or password' : 'Signup failed')
    } finally {
      setIsLoading(false)
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 lg:p-8 font-sans">
      <div className="w-full max-w-[1400px] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex min-h-[800px] border border-slate-100">
        
        {/* LEFT SIDE: Form */}
        <div className="w-full lg:w-1/2 p-12 lg:p-20 flex flex-col justify-center relative">
          <div className="max-w-md mx-auto w-full">
            <button className="absolute top-10 left-10 p-2 rounded-full hover:bg-slate-50 transition-colors">
               <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                 <MessageSquare size={24} fill="currentColor" className="opacity-20" />
                 <MessageSquare size={24} className="absolute" />
               </div>
            </button>

            <div className="mb-12">
              <h1 className="font-display font-bold text-4xl lg:text-5xl text-slate-900 mb-4 tracking-tight">
                {isLogin ? 'Welcome Back' : 'Sign Up'}
              </h1>
              <p className="text-slate-500 text-lg font-medium">
                {isLogin ? 'Enter your details to access your workspace.' : 'Secure your communications with WhatsApp CRM.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
                  {error}
                </div>
              )}
              {!isLogin && (
                <div className="space-y-2 group">
                  <div className="relative">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
                    <input 
                      type="text" 
                      placeholder="Full Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-14 pr-5 py-5 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-2xl outline-none font-bold text-slate-900 placeholder:text-slate-400 transition-all text-base"
                    />
                    {name.length > 2 && <CheckCircle2 className="absolute right-5 top-1/2 -translate-y-1/2 text-emerald-500" size={20} />}
                  </div>
                </div>
              )}

              <div className="space-y-2 group">
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
                  <input 
                    type="email" 
                    placeholder="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full pl-14 pr-5 py-5 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-2xl outline-none font-bold text-slate-900 placeholder:text-slate-400 transition-all text-base ${isEmailValid ? 'border-emerald-500/20 bg-emerald-50/10' : ''}`}
                  />
                  {isEmailValid && <CheckCircle2 className="absolute right-5 top-1/2 -translate-y-1/2 text-emerald-500" size={20} />}
                </div>
              </div>

              <div className="space-y-2 group">
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={20} />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-14 pr-12 py-5 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-2xl outline-none font-bold text-slate-900 placeholder:text-slate-400 transition-all text-base tracking-wide"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {!isLogin && (
                   <div className="flex gap-2 pt-2 pl-2">
                      <div className={`h-1 flex-1 rounded-full transition-colors ${password.length > 0 ? (password.length > 8 ? 'bg-emerald-500' : 'bg-amber-400') : 'bg-slate-100'}`} />
                      <div className={`h-1 flex-1 rounded-full transition-colors ${password.length > 8 ? 'bg-emerald-500' : 'bg-slate-100'}`} />
                      <div className={`h-1 flex-1 rounded-full transition-colors ${/[A-Z]/.test(password) && /[0-9]/.test(password) ? 'bg-emerald-500' : 'bg-slate-100'}`} />
                   </div>
                )}
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full py-5 bg-primary text-white font-bold text-lg rounded-2xl shadow-xl shadow-primary/30 hover:bg-blue-700 hover:shadow-2xl hover:shadow-primary/40 hover:-translate-y-1 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 mt-4"
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            </form>

            <div className="my-10 flex items-center gap-4">
               <div className="h-px bg-slate-100 flex-1" />
               <span className="text-slate-400 text-sm font-bold uppercase tracking-wider">Or continue with</span>
               <div className="h-px bg-slate-100 flex-1" />
            </div>

            <div className="flex gap-4">
               <button className="flex-1 py-4 border border-slate-200 rounded-2xl flex items-center justify-center hover:bg-slate-50 transition-colors">
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-6 h-6" alt="Google" />
               </button>
               <button className="flex-1 py-4 border border-slate-200 rounded-2xl flex items-center justify-center hover:bg-slate-50 transition-colors">
                  <img src="https://www.svgrepo.com/show/475647/facebook-color.svg" className="w-6 h-6" alt="Facebook" />
               </button>
            </div>

            <p className="mt-10 text-center text-slate-500 font-medium">
               {isLogin ? "Don't have an account?" : "Already a member?"}
               <button 
                 onClick={() => setIsLogin(!isLogin)}
                 className="ml-2 text-primary font-bold hover:underline"
               >
                 {isLogin ? 'Sign up' : 'Sign in'}
               </button>
            </p>
          </div>
        </div>

        {/* RIGHT SIDE: Visual Showcase */}
        <div className="hidden lg:flex w-1/2 bg-primary relative overflow-hidden items-center justify-center p-20">
           {/* Abstract Shapes */}
           <div className="absolute top-[-20%] right-[-20%] w-[800px] h-[800px] bg-white/10 rounded-full blur-3xl" />
           <div className="absolute bottom-[-20%] left-[-20%] w-[600px] h-[600px] bg-indigo-600/30 rounded-full blur-3xl" />
           
           {/* Floating Cards Mockup */}
           <div className="relative w-full max-w-lg perspective-1000">
              
              {/* Card 1: Inbox Stats */}
              <div className="bg-white rounded-3xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-700 transform rotate-[-2deg] hover:rotate-0 transition-transform mb-6">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                       <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Inbox</p>
                       <h3 className="text-4xl font-display font-bold text-slate-900">176,18</h3>
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/20">
                       <BarChart3 className="text-white" />
                    </div>
                 </div>
                 <div className="w-full h-16 bg-slate-50 rounded-xl overflow-hidden relative">
                    <svg className="absolute bottom-0 left-0 w-full h-full" preserveAspectRatio="none">
                       <path d="M0,40 Q50,10 100,30 T200,20 T300,40 L300,64 L0,64 Z" fill="rgba(37, 99, 235, 0.1)" />
                       <path d="M0,40 Q50,10 100,30 T200,20 T300,40" fill="none" stroke="#2563EB" strokeWidth="3" />
                    </svg>
                 </div>
              </div>

              {/* Card 2: Security */}
              <div className="bg-white rounded-3xl p-8 shadow-2xl animate-in fade-in slide-in-from-right-10 duration-1000 delay-200 transform translate-x-12">
                 <div className="flex items-center gap-4 mb-4">
                    <div className="w-1.5 h-8 bg-primary rounded-full" />
                    <div className="w-10 h-1 bg-slate-100 rounded-full" />
                    <div className="w-24 h-1 bg-slate-100 rounded-full" />
                 </div>
                 <div className="flex items-center gap-4 mb-4">
                    <div className="w-1.5 h-8 bg-slate-200 rounded-full" />
                    <div className="w-16 h-1 bg-slate-100 rounded-full" />
                    <div className="w-12 h-1 bg-slate-100 rounded-full" />
                 </div>
                 <div className="mt-8 flex items-center gap-4">
                    <Shield className="text-amber-500 w-8 h-8" />
                    <div>
                       <h4 className="font-bold text-slate-900">Your data, your rules</h4>
                       <p className="text-xs text-slate-400 font-medium">End-to-end encryption ensures privacy.</p>
                    </div>
                 </div>
              </div>

              {/* Floating Icons */}
              <div className="absolute -top-10 -right-10 w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center animate-bounce duration-[3000ms]">
                 <img src="https://www.svgrepo.com/show/452229/instagram-1.svg" className="w-10 h-10" alt="" />
              </div>
              <div className="absolute top-1/2 -left-16 w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center animate-pulse">
                 <img src="https://www.svgrepo.com/show/475689/tiktok-color.svg" className="w-8 h-8" alt="" />
              </div>

           </div>
        </div>

      </div>
    </div>
  );
};
