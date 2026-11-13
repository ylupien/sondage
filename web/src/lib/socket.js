import { io } from 'socket.io-client';

// token : jeton du lien personnel (participant) ; sans jeton, le cookie admin sert d'identification.
export function connect(token) {
  return io({ auth: token ? { token } : {}, withCredentials: true });
}
