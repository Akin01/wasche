/* @refresh reload */
import { render } from '@solidjs/web';
import './styles/global.css';
import Dashboard from './components/Dashboard';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error('Root element not found. Check index.html');
}

render(() => <Dashboard />, root!);
