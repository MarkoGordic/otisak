import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Settings, Shield, BookOpen, Fingerprint } from 'lucide-react';
import { Sidebar, MobileNav } from '../components/Sidebar';
import { AppCopyright } from '../components/AppCopyright';
import { Button } from '../components/ui/Button';
import { useLang } from '../components/LangProvider';
import { useToast } from '../components/Toast';

type UserInfo = { name?: string; role?: string };

export default function AdminSettingsPage() {
  const navigate = useNavigate();
  const { t } = useLang();
  const toast = useToast();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Whether the ELPIS_ID_* env is configured on the server. The soft toggle only
  // has an effect when this is true; otherwise the control is shown disabled.
  const [elpisConfigured, setElpisConfigured] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated || data.user?.role !== 'admin') {
        navigate('/dashboard', { replace: true }); return;
      }
      setUser({ name: data.user?.name, role: data.user?.role });
    })();
  }, [navigate]);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings', { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setSettings(d.settings || {}); }
      const st = await fetch('/api/auth/elpis/status', { credentials: 'include' });
      if (st.ok) { const s = await st.json(); setElpisConfigured(!!s.configured); }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) loadSettings(); }, [user, loadSettings]);

  const toggleSetting = async (key: string) => {
    setSaving(true);
    const newValue = settings[key] === 'true' ? 'false' : 'true';
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [key]: newValue }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, [key]: newValue }));
        toast.success(t('settings.saveSuccess'));
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('settings.saveFailed'));
      }
    } catch {
      toast.error(t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!user || loading) {
    return <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex">
      <Sidebar userName={user.name} userRole={user.role} />
      <MobileNav userName={user.name} userRole={user.role} />

      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen">
        <main className="flex-1 pb-20 lg:pb-8">
          <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto bg-[var(--bg-primary)] min-h-full">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-11 h-11 rounded-xl bg-accent-light flex items-center justify-center">
                <Settings className="w-6 h-6 text-accent" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">Podesavanja sistema</h1>
                <p className="text-sm text-[var(--text-secondary)]">Upravljanje globalnim podesavanjima platforme</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Practice Mode Toggle */}
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent-light flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="text-base font-display font-semibold text-[var(--text-primary)]">Rezim vezbe</h3>
                      <p className="text-sm text-[var(--text-secondary)]">Dozvoli studentima pristup ispitima za vezbu</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleSetting('practice_mode_enabled')}
                    disabled={saving}
                    className={`relative w-14 h-7 rounded-full transition-colors ${
                      settings.practice_mode_enabled === 'true' ? 'bg-success' : 'bg-[var(--text-muted)]'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                      settings.practice_mode_enabled === 'true' ? 'translate-x-7' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-3 ml-14">
                  {settings.practice_mode_enabled === 'true'
                    ? 'Studenti mogu da pristupe ispitima za vezbu sa pocetne strane.'
                    : 'Tab za vezbu je sakriven od studenata. Samo pravi ispiti su dostupni.'}
                </p>
              </div>

              {/* ELPIS ID Login Toggle */}
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent-light flex items-center justify-center">
                      <Fingerprint className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="text-base font-display font-semibold text-[var(--text-primary)]">ELPIS ID prijava</h3>
                      <p className="text-sm text-[var(--text-secondary)]">Prikaži dugme „Nastavi sa ELPIS ID“ na stranici za prijavu</p>
                    </div>
                  </div>
                  <button
                    onClick={() => elpisConfigured && toggleSetting('elpis_id_login_enabled')}
                    disabled={saving || !elpisConfigured}
                    className={`relative w-14 h-7 rounded-full transition-colors ${
                      elpisConfigured && settings.elpis_id_login_enabled !== 'false' ? 'bg-success' : 'bg-[var(--text-muted)]'
                    } ${!elpisConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                      elpisConfigured && settings.elpis_id_login_enabled !== 'false' ? 'translate-x-7' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-3 ml-14">
                  {!elpisConfigured
                    ? 'ELPIS ID nije konfigurisan na serveru. Podesite ELPIS_ID_* promenljive okruženja da biste omogućili ovu opciju.'
                    : settings.elpis_id_login_enabled !== 'false'
                      ? 'Dugme za prijavu putem ELPIS ID je vidljivo. Prijava uspeva samo za naloge koji su povezani sa ELPIS ID.'
                      : 'Dugme za prijavu putem ELPIS ID je sakriveno.'}
                </p>
              </div>

              {/* Subject Access Info */}
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-warning-light flex items-center justify-center">
                    <Shield className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="text-base font-display font-semibold text-[var(--text-primary)]">Pristup predmetima</h3>
                    <p className="text-sm text-[var(--text-secondary)]">Samo administratori mogu da kreiraju, menjaju i brisu predmete. Asistenti mogu da upravljaju ispitima i pitanjima u okviru dodeljenih predmeta.</p>
                  </div>
                </div>
                <div className="mt-4 ml-14 flex gap-3">
                  <Button variant="secondary" size="sm" onClick={() => navigate('/subjects')}>Upravljaj predmetima</Button>
                  <Button variant="secondary" size="sm" onClick={() => navigate('/admin/users')}>Upravljaj korisnicima</Button>
                </div>
              </div>

              {/* Lockdown Info */}
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] p-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-danger-light flex items-center justify-center">
                    <Shield className="w-5 h-5 text-danger" />
                  </div>
                  <div>
                    <h3 className="text-base font-display font-semibold text-[var(--text-primary)]">Zabranjivanje rada</h3>
                    <p className="text-sm text-[var(--text-secondary)]">Tokom aktivnog ispita, mozete zabraniti rad na racunarima studenata iz sobe za ispit. Studentima se prikazuje crveni ekran sa porukom.</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-3 ml-14">
                  Otvorite sobu za ispit i koristite dugme za zabranu rada.
                </p>
              </div>
            </div>
          </div>
          <div className="px-4 pb-6 pt-2 flex justify-center"><AppCopyright /></div>
        </main>
      </div>
    </div>
  );
}
