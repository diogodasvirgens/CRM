import { useQuery, useQueryClient } from "@tanstack/react-query";
import { connectWhatsapp, fetchWhatsappStatus, logoutWhatsapp } from "../../api/resources";
import { apiErrorMessage } from "../../api/client";
import { useToastStore } from "../../state/toast";
import { WhatsappConnectionStatus } from "../../types";

const STATUS_LABELS: Record<WhatsappConnectionStatus, string> = {
  connected: "Conectado",
  connecting: "Conectando...",
  qr: "Aguardando leitura do QR Code",
  disconnected: "Desconectado",
  logged_out: "Sessão encerrada — é preciso parear de novo",
};

const STATUS_DOT_CLASS: Record<WhatsappConnectionStatus, string> = {
  connected: "active",
  connecting: "inactive",
  qr: "inactive",
  disconnected: "inactive",
  logged_out: "inactive",
};

export function AdminWhatsapp() {
  const queryClient = useQueryClient();
  const toast = useToastStore();

  const statusQuery = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: fetchWhatsappStatus,
    refetchInterval: 3000,
  });

  const state = statusQuery.data;

  async function handleLogout() {
    if (!confirm("Desconectar o WhatsApp? Você vai precisar escanear o QR Code de novo para reconectar.")) return;
    try {
      await logoutWhatsapp();
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  async function handleConnect() {
    try {
      await connectWhatsapp();
      queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  return (
    <div>
      <h2>WhatsApp</h2>
      <p className="hint-text" style={{ marginBottom: 20 }}>
        Conexão com o número de WhatsApp usado pela caixa de entrada. A sessão fica salva no servidor: uma vez
        pareado, não é preciso escanear de novo, mesmo reiniciando o sistema — só se a sessão cair ou for
        desconectada manualmente.
      </p>

      {state && (
        <div className="whatsapp-status-box">
          <div className="whatsapp-status-line">
            <span className={`status-dot ${STATUS_DOT_CLASS[state.status]}`} />
            <b>{STATUS_LABELS[state.status]}</b>
          </div>

          {state.status === "connected" && state.phone && (
            <p className="hint-text">Número conectado: {state.phone}</p>
          )}

          {(state.status === "logged_out" || state.status === "disconnected") && state.lastError && (
            <p className="error-text">{state.lastError}</p>
          )}

          {state.status === "qr" && state.qr && (
            <div className="whatsapp-qr-box">
              <img src={state.qr} alt="QR Code do WhatsApp" width={260} height={260} />
              <p className="hint-text">Abra o WhatsApp no celular, vá em Aparelhos conectados e escaneie o código.</p>
            </div>
          )}

          {state.status === "connecting" && <p className="hint-text">Iniciando conexão...</p>}

          {state.status === "connected" && (
            <button className="btn btn-danger btn-small" onClick={handleLogout} style={{ marginTop: 12 }}>
              Desconectar
            </button>
          )}

          {(state.status === "disconnected" || state.status === "logged_out") && (
            <button className="btn btn-primary btn-small" onClick={handleConnect} style={{ marginTop: 12 }}>
              Conectar / Gerar QR Code
            </button>
          )}
        </div>
      )}
    </div>
  );
}
