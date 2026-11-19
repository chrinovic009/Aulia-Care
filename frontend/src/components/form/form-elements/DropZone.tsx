import { useRef, useState } from "react";
import ComponentCard from "../../common/ComponentCard";

const acceptedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

const DropzoneComponent: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const accept = (incoming: FileList | File[]) => {
    setFiles(Array.from(incoming).filter((file) => acceptedTypes.has(file.type)));
    setDragActive(false);
  };

  return (
    <ComponentCard title="Dépôt de fichier">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => { event.preventDefault(); accept(event.dataTransfer.files); }}
        className={`cursor-pointer rounded-xl border border-dashed p-7 text-center transition lg:p-10 ${
          isDragActive ? "border-brand-500 bg-gray-100 dark:bg-gray-800" : "border-gray-300 bg-gray-50 hover:border-brand-500 dark:border-gray-700 dark:bg-gray-900"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          multiple
          onChange={(event) => event.target.files && accept(event.target.files)}
        />
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl dark:bg-gray-800" aria-hidden="true">↑</div>
          <h4 className="mb-2 font-semibold text-gray-800 text-theme-xl dark:text-white/90">{isDragActive ? "Déposez les fichiers ici" : "Glissez-déposez vos fichiers"}</h4>
          <p className="mb-3 text-sm text-gray-700 dark:text-gray-400">PNG, JPG, WebP ou SVG</p>
          <span className="font-medium underline text-theme-sm text-brand-500">Parcourir les fichiers</span>
          {files.length > 0 && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{files.length} fichier(s) sélectionné(s)</p>}
        </div>
      </div>
    </ComponentCard>
  );
};

export default DropzoneComponent;
