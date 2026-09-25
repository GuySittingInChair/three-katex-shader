// The built-in sketches (files in src/sketches/) are the site owner's work;
// shared sketches belong to whoever shared them.
export const SITE_OWNER = 'GuySittingInChair';

export const authorOf = (sketch) => sketch?.community?.author ?? SITE_OWNER;

export const profilePath = (username) => `/u/${encodeURIComponent(username)}`;
