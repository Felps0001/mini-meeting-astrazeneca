import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import "./CheckIn.css";

const CheckIn = () => {
  const { token } = useParams();
  const [status, setStatus] = useState("loading"); // loading | success | already | error
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    api
      .post(`/meetings/checkin/${token}`)
      .then((res) => {
        setData(res.data);
        setStatus(res.data.alreadyCheckedIn ? "already" : "success");
      })
      .catch((err) => {
        setErrorMsg(err.response?.data?.message || "Token de check-in inválido");
        setStatus("error");
      });
  }, [token]);

  if (status === "loading")
    return (
      <div className="checkin-page">
        <div className="checkin-card">
          <div className="checkin-spinner">⏳</div>
          <p>Verificando check-in...</p>
        </div>
      </div>
    );

  if (status === "error")
    return (
      <div className="checkin-page">
        <div className="checkin-card checkin-card--error">
          <div className="checkin-icon">❌</div>
          <h2>Token inválido</h2>
          <p>{errorMsg}</p>
        </div>
      </div>
    );

  if (status === "already")
    return (
      <div className="checkin-page">
        <div className="checkin-card checkin-card--already">
          <div className="checkin-icon">ℹ️</div>
          <h2>Check-in já realizado</h2>
          <p className="checkin-name">{data.attendee.name}</p>
          <p className="checkin-event">{data.event.title}</p>
          <p className="checkin-time">
            Confirmado às{" "}
            {new Date(data.attendee.checkedInAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
    );

  return (
    <div className="checkin-page">
      <div className="checkin-card checkin-card--success">
        <div className="checkin-icon">✅</div>
        <h2>Check-in confirmado!</h2>
        <p className="checkin-name">{data.attendee.name}</p>
        {data.attendee.crm && (
          <p className="checkin-crm">
            CRM {data.attendee.crm}/{data.attendee.crmUf}
          </p>
        )}
        <div className="checkin-divider" />
        <p className="checkin-event">{data.event.title}</p>
        <p className="checkin-location">📍 {data.event.location}</p>
      </div>
    </div>
  );
};

export default CheckIn;
