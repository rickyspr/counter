import { clearMediaUrlCache } from "@repcount/shared";
import { NavLink } from "react-router-dom";
import { supabase } from "../lib/supabase";

const links = [
  { to: "/", label: "Översikt", end: true },
  { to: "/pass", label: "Mina pass", end: false },
  { to: "/socialt", label: "Socialt", end: false },
  { to: "/profil", label: "Profil", end: false },
];

export function NavBar() {
  return (
    <nav className="navbar">
      <span className="navbar-brand">RepCount</span>
      <div className="navbar-links">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              isActive ? "navbar-link navbar-link-active" : "navbar-link"
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          clearMediaUrlCache();
          void supabase.auth.signOut();
        }}
      >
        Logga ut
      </button>
    </nav>
  );
}
