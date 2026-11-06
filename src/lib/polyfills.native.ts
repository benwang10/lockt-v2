// React Native's built-in URL is incomplete (no hostname/searchParams setters);
// supabase-js and our link validation rely on the WHATWG URL API.
import 'react-native-url-polyfill/auto';
