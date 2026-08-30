import { initialsFor } from "@counter/shared";

interface Props {
  // A signed URL for the stored avatar, or null to fall back to initials.
  uri: string | null;
  name: string;
  size: number;
}

export function Avatar({ uri, name, size }: Props) {
  const style = { width: size, height: size, fontSize: size * 0.38 };

  if (uri) {
    return (
      <img className="avatar" style={style} src={uri} alt="" width={size} height={size} />
    );
  }

  return (
    <span className="avatar avatar-fallback" style={style} aria-hidden="true">
      {initialsFor(name)}
    </span>
  );
}
