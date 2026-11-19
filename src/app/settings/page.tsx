import { getDb } from '@/lib/db';
import { getModels } from '@/lib/settings';
import { getMonthlyCapUsd, getMonthlySpendUsd } from '@/lib/ai/budget';
import { hasApiKey } from '@/lib/ai/client';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  const db = getDb();
  const models = getModels(db);
  const keySet = hasApiKey();

  return (
    <div className="reading">
      <h1>Settings</h1>
      <p className="lede">AI features are optional. Everything else works without a key.</p>

      <section className="panel" aria-labelledby="key-h">
        <h2 id="key-h">Claude API key</h2>
        <p data-testid="key-status">
          {keySet ? 'A key is set. The app can use AI features.' : 'No key set. AI features are switched off.'}
        </p>
        <p className="muted">
          The key is read from <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> and never shown or sent to the
          browser. Edit that file, then restart the app.
        </p>
      </section>

      <SettingsForm
        keySet={keySet}
        initial={{ model_main: models.main, model_cheap: models.cheap, monthly_cap_usd: getMonthlyCapUsd(db) }}
        spend={getMonthlySpendUsd(db)}
      />
    </div>
  );
}
