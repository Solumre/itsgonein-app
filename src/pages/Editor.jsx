import { Navigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import { useTitle } from '../lib/hooks';
import { useToast } from '../components/Toast';
import { EditorTools, QuizBank } from '../components/EditorTools';
import { PageHead } from '../components/Bits';

// The Junior Editor's desk.
export default function Editor() {
  const { isEditor, profile } = useSession();
  const toast = useToast();
  useTitle('Editor desk');
  if (!isEditor) return <Navigate to="/predict" replace />;
  const run = async (fn, ok) => {
    try { await fn(); toast(ok, 'good'); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <div className="page editor">
      <PageHead title="Editor desk" sub={`You're a Junior Editor${profile?.nickname ? `, ${profile.nickname}` : ''} ✍️ What you post here goes out to everyone, with your name on it, so keep it fun and fair.`} />
      <EditorTools run={run} />
      <QuizBank run={run} />
    </div>
  );
}
