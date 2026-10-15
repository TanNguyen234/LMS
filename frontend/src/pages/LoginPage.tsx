import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GraduationCap, Lock, Mail, ArrowRight, AlertCircle, Shield, BookOpen, User } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('admin@university.edu.vn');
  const [password, setPassword] = useState('Demo@123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Email hoặc mật khẩu không chính xác.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Demo@123');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-500/30 mb-4">
            <GraduationCap className="w-9 h-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">University LMS Portal</h1>
          <p className="text-slate-400 text-sm mt-1">Cổng thông tin Đào tạo & Quản lý Học tập</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Đăng nhập hệ thống</h2>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                Email hoặc Tên đăng nhập
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-sm transition"
                  placeholder="name@university.edu.vn"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-sm transition"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-500/20 flex items-center justify-center space-x-2 transition disabled:opacity-50"
            >
              {loading ? (
                <span>Đang xử lý...</span>
              ) : (
                <>
                  <span>Đăng nhập</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Switcher */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-3 text-center">
              Tài khoản mẫu báo cáo (Demo Accounts)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@university.edu.vn')}
                className="p-2 rounded-xl border border-purple-200 hover:bg-purple-50 text-left transition flex flex-col items-center text-center"
              >
                <Shield className="w-4 h-4 text-purple-600 mb-1" />
                <span className="text-xs font-bold text-purple-900 block">Admin</span>
                <span className="text-[10px] text-purple-500 truncate w-full">Quản trị</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('lecturer1@university.edu.vn')}
                className="p-2 rounded-xl border border-blue-200 hover:bg-blue-50 text-left transition flex flex-col items-center text-center"
              >
                <BookOpen className="w-4 h-4 text-blue-600 mb-1" />
                <span className="text-xs font-bold text-blue-900 block">Lecturer</span>
                <span className="text-[10px] text-blue-500 truncate w-full">TS. Nam</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('student1@university.edu.vn')}
                className="p-2 rounded-xl border border-emerald-200 hover:bg-emerald-50 text-left transition flex flex-col items-center text-center"
              >
                <User className="w-4 h-4 text-emerald-600 mb-1" />
                <span className="text-xs font-bold text-emerald-900 block">Student</span>
                <span className="text-[10px] text-emerald-500 truncate w-full">Nguyễn An</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 text-center mt-3">
              Mật khẩu mặc định hệ thống: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">Demo@123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
