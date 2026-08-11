import '@fontsource-variable/source-sans-3/wght.css';
import './styles/main.css';
import { renderApp } from './app';

const theme = localStorage.getItem('calendar-contact-theme');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
renderApp();
