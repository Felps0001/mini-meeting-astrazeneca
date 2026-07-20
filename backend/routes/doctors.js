const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// GET /api/doctors - lista os médicos cadastrados (admin). Suporta busca por
// nome/CRM via ?search= e ordena pelos mais recentes.
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};
    if (search && search.trim()) {
      const term = search.trim();
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { crm: { $regex: term.replace(/\D/g, ''), $options: 'i' } }
      ];
    }
    const doctors = await Doctor.find(filter)
      .select('-meetings.meetingTitle')
      .sort({ updatedAt: -1 })
      .limit(500);
    res.json(doctors);
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

// GET /api/doctors/:crm/:uf - detalhe de um médico, com histórico de meetings.
router.get('/:crm/:uf', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const crmNum = String(req.params.crm).replace(/\D/g, '');
    const ufUpper = String(req.params.uf).trim().toUpperCase();
    const doctor = await Doctor.findOne({ crm: crmNum, crmUf: ufUpper })
      .populate('meetings.meeting', 'title date location status');
    if (!doctor) return res.status(404).json({ message: 'Médico não encontrado' });
    res.json(doctor);
  } catch {
    res.status(500).json({ message: 'Erro interno' });
  }
});

module.exports = router;
