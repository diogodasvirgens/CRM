import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createTag, deleteTag, fetchTags } from "../../api/resources";
import { apiErrorMessage } from "../../api/client";
import { useToastStore } from "../../state/toast";

export function AdminTags() {
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const tagsQuery = useQuery({ queryKey: ["tags"], queryFn: fetchTags });
  const [name, setName] = useState("");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["tags"] });
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createTag(trimmed);
      setName("");
      invalidate();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Apagar esta etiqueta? Ela sai de todos os leads que a usam.")) return;
    try {
      await deleteTag(id);
      invalidate();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  return (
    <div>
      <h2>Etiquetas</h2>
      <p className="hint-text" style={{ marginBottom: 16 }}>
        Qualquer usuário logado pode criar uma etiqueta nova direto no card do lead. Aqui você também pode apagar.
      </p>
      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, maxWidth: 360, marginBottom: 20 }}>
        <input placeholder="Nova etiqueta" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-secondary btn-small" type="submit">
          Criar
        </button>
      </form>
      <div className="tag-picker">
        {tagsQuery.data?.map((tag) => (
          <span key={tag.id} className="tag-pill" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {tag.name}
            <button
              onClick={() => handleDelete(tag.id)}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--danger)" }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
