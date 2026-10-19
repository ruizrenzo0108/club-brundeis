import React, { useState, useEffect } from 'react';
import { Coffee, Award, Sparkles, Check, Smartphone, Store, Plus, RefreshCw, Star, QrCode, Search, UserCheck, UserPlus, ArrowRight } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from './supabaseClient';

// --- FORMATEADOR AUTOMÁTICO DE RUT CHILENO ---
const formatearRut = (valor) => {
  if (!valor) return '';
  // Limpia puntos, guiones y caracteres raros, permitiendo números y K
  const limpio = valor.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length === 0) return '';
  if (limpio.length === 1) return limpio;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

  // Agrega puntos de miles
  const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpoFormateado}-${dv}`;
};

// --- FORMATEADOR AUTOMÁTICO DE CELULAR CHILENO (+56 9 XXXX XXXX) ---
const formatearCelular = (valor) => {
  if (!valor) return '';
  // Solo toma dígitos
  let soloNumeros = valor.replace(/\D/g, '');

  // Si pegó el 569 al inicio, lo removemos para procesar solo el número local
  if (soloNumeros.startsWith('569')) {
    soloNumeros = soloNumeros.slice(3);
  } else if (soloNumeros.startsWith('56')) {
    soloNumeros = soloNumeros.slice(2);
  } else if (soloNumeros.startsWith('9') && soloNumeros.length > 8) {
    soloNumeros = soloNumeros.slice(1);
  }

  // Limitamos a los 8 dígitos que van después del +56 9
  const digitos = soloNumeros.slice(0, 8);
  if (digitos.length === 0) return '';

  if (digitos.length <= 4) {
    return `+56 9 ${digitos}`;
  }
  return `+56 9 ${digitos.slice(0, 4)} ${digitos.slice(4)}`;
};

export default function App() {
  const [vista, setVista] = useState('cliente');
  const [mostrarQR, setMostrarQR] = useState(false);

  // Cliente activo
  const [cliente, setCliente] = useState({
    id: null,
    nombre: "Renzo",
    telefono: "+56 9 8299 1805",
    rut: "29.405.670-K",
    sellos: 1,
    tarjetas_completadas: 0,
    meta: 8,
    premio: "Café de Especialidad o Postre a elección",
  });

  // Búsqueda en caja
  const [inputBusqueda, setInputBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensajeCaja, setMensajeCaja] = useState("");

  // Formulario de registro estandarizado
  const [formRegistro, setFormRegistro] = useState({
    nombre: "",
    rut: "",
    telefono: "",
  });
  const [mensajeRegistro, setMensajeRegistro] = useState("");

  // 1. Buscar cliente por RUT o Teléfono
  const buscarCliente = async (criterio) => {
    if (!criterio) return;
    setCargando(true);
    setMensajeCaja("");

    try {
      const limpio = criterio.trim();
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .or(`rut.ilike.%${limpio}%,telefono.ilike.%${limpio}%`)
        .limit(1)
        .maybeSingle();

      if (error) {
        setMensajeCaja("Error al consultar la base de datos.");
      } else if (data) {
        setCliente(prev => ({
          ...prev,
          id: data.id,
          nombre: data.nombre,
          telefono: data.telefono,
          rut: data.rut,
          sellos: data.sellos,
          tarjetas_completadas: data.tarjetas_completadas || 0,
        }));
        setMensajeCaja("Cliente cargado correctamente.");
      } else {
        setMensajeCaja("No se encontró ningún cliente.");
      }
    } catch (err) {
      setMensajeCaja("Error inesperado en la búsqueda.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    buscarCliente("29.405.670-K");

    const canal = supabase
      .channel('cambios-clientes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'clientes' },
        (payload) => {
          if (payload.new && (payload.new.id === cliente.id || payload.new.rut === cliente.rut)) {
            setCliente(prev => ({
              ...prev,
              sellos: payload.new.sellos,
              tarjetas_completadas: payload.new.tarjetas_completadas,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [cliente.id, cliente.rut]);

  // Handlers con formateo en tiempo real
  const handleRutChange = (e) => {
    const valorFormateado = formatearRut(e.target.value);
    setFormRegistro(prev => ({ ...prev, rut: valorFormateado }));
  };

  const handleTelefonoChange = (e) => {
    const valorFormateado = formatearCelular(e.target.value);
    setFormRegistro(prev => ({ ...prev, telefono: valorFormateado }));
  };

  // 2. Registrar nuevo cliente
  const registrarCliente = async (e) => {
    e.preventDefault();
    if (!formRegistro.nombre.trim()) {
      setMensajeRegistro("Por favor ingresa un nombre.");
      return;
    }
    if (!formRegistro.rut.trim() && !formRegistro.telefono.trim()) {
      setMensajeRegistro("Debes ingresar al menos un RUT o celular.");
      return;
    }

    setCargando(true);
    setMensajeRegistro("");

    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([
          {
            nombre: formRegistro.nombre.trim(),
            rut: formRegistro.rut.trim() || null,
            telefono: formRegistro.telefono.trim() || null,
            sellos: 1, // Bienvenida
            tarjetas_completadas: 0,
          },
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          setMensajeRegistro("Este RUT o teléfono ya se encuentra registrado.");
        } else {
          setMensajeRegistro("Hubo un error al registrar. Intenta nuevamente.");
        }
      } else if (data) {
        setCliente({
          id: data.id,
          nombre: data.nombre,
          telefono: data.telefono,
          rut: data.rut,
          sellos: data.sellos,
          tarjetas_completadas: 0,
          meta: 8,
          premio: "Café de Especialidad o Postre a elección",
        });
        setFormRegistro({ nombre: "", rut: "", telefono: "" });
        setVista('cliente');
      }
    } catch (err) {
      setMensajeRegistro("Error inesperado en el servidor.");
    } finally {
      setCargando(false);
    }
  };

  // 3. Sumar sello
  const sumarSello = async () => {
    if (cliente.sellos >= cliente.meta) return;

    const nuevosSellos = cliente.sellos + 1;
    setCargando(true);

    try {
      const { error } = await supabase
        .from('clientes')
        .update({ sellos: nuevosSellos, updated_at: new Date() })
        .eq('id', cliente.id);

      if (!error) {
        setCliente(prev => ({ ...prev, sellos: nuevosSellos }));
        setMensajeCaja(`¡Sello acreditado! (${nuevosSellos}/${cliente.meta})`);
      }
    } finally {
      setCargando(false);
    }
  };

  // 4. Canjear premio
  const canjearPremio = async () => {
    setCargando(true);
    const nuevasCompletadas = (cliente.tarjetas_completadas || 0) + 1;

    try {
      const { error } = await supabase
        .from('clientes')
        .update({
          sellos: 1,
          tarjetas_completadas: nuevasCompletadas,
          updated_at: new Date()
        })
        .eq('id', cliente.id);

      if (!error) {
        setCliente(prev => ({
          ...prev,
          sellos: 1,
          tarjetas_completadas: nuevasCompletadas,
        }));
        setMensajeCaja("¡Premio canjeado! Nueva tarjeta iniciada.");
      }
    } finally {
      setCargando(false);
    }
  };

  const slots = Array.from({ length: cliente.meta });
  const porcentaje = (cliente.sellos / cliente.meta) * 100;
  const esCompletada = cliente.sellos >= cliente.meta;

  return (
    <div className="relative min-h-screen bg-[#0E0B09] text-[#F5EDE2] flex flex-col items-center justify-start p-4 font-sans select-none overflow-x-hidden">
      
      {/* Fondo nítido del salón Brundeis */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center filter blur-[1px] opacity-85 brightness-95 pointer-events-none"
        style={{ backgroundImage: "url('/fondo.JPG')" }}
      />
      <div className="fixed inset-0 z-0 bg-black/45 pointer-events-none" />

      {/* Contenedor central */}
      <div className="relative z-10 w-full flex flex-col items-center">
        
        {/* Selector de vistas */}
        <div className="flex bg-[#1E1815]/95 backdrop-blur-md border border-[#4A3B32] p-1.5 rounded-2xl mb-6 shadow-2xl">
          <button
            onClick={() => setVista('cliente')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              vista === 'cliente'
                ? 'bg-[#C98A42] text-[#14100E] shadow-md shadow-[#C98A42]/30 font-bold'
                : 'text-[#A89A90] hover:text-[#F5EDE2]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Tarjeta
          </button>
          <button
            onClick={() => setVista('registro')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              vista === 'registro'
                ? 'bg-[#C98A42] text-[#14100E] shadow-md shadow-[#C98A42]/30 font-bold'
                : 'text-[#A89A90] hover:text-[#F5EDE2]'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Registrarse
          </button>
          <button
            onClick={() => setVista('caja')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              vista === 'caja'
                ? 'bg-[#C98A42] text-[#14100E] shadow-md shadow-[#C98A42]/30 font-bold'
                : 'text-[#A89A90] hover:text-[#F5EDE2]'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            Caja
          </button>
        </div>

        {/* ================= VISTA CLIENTE ================= */}
        {vista === 'cliente' && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-6 relative overflow-hidden">
            
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#C98A42]/20 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between border-b border-[#332822] pb-4">
              <div>
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#D99B52] uppercase">
                  Club de Fidelización
                </span>
                <h1 className="text-2xl font-black tracking-wider text-[#F5EDE2] mt-0.5">
                  BRUNDEIS
                </h1>
                <p className="text-[11px] text-[#A89A90] font-medium tracking-wide">
                  Cafetería & Cocina
                </p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-[#261E1A] border border-[#4A3B32] flex items-center justify-center text-[#D99B52] shadow-inner">
                <Coffee className="w-6 h-6 stroke-[2]" />
              </div>
            </div>

            <div className="flex justify-between items-center bg-[#241D19]/90 border border-[#3E3029] rounded-2xl p-3.5 px-4 shadow-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#A89A90] font-semibold">Cliente</p>
                <p className="text-base font-bold text-[#F5EDE2]">{cliente.nombre}</p>
                <div className="flex flex-col text-[11px] font-mono mt-0.5 space-y-0.5">
                  {cliente.rut && <span className="text-[#D99B52]">RUT: {cliente.rut}</span>}
                  {cliente.telefono && <span className="text-[#A89A90] text-[10px]">{cliente.telefono}</span>}
                </div>
              </div>
              <button
                onClick={() => setMostrarQR(!mostrarQR)}
                className="flex items-center gap-1.5 bg-[#171210] hover:bg-[#2D231E] border border-[#4A3B32] text-[#D99B52] px-3 py-2 rounded-xl text-xs font-semibold transition"
              >
                <QrCode className="w-4 h-4" />
                <span>{mostrarQR ? 'Ocultar' : 'Mi QR'}</span>
              </button>
            </div>

            {mostrarQR && (
              <div className="bg-[#14100E] border border-[#4A3B32] rounded-2xl p-5 flex flex-col items-center text-center space-y-3 shadow-inner">
                <p className="text-xs text-[#A89A90]">Muestra este código en barra al pedir tu café:</p>
                <div className="bg-white p-3 rounded-2xl shadow-lg">
                  <QRCodeSVG 
                    value={cliente.rut || cliente.telefono || cliente.nombre} 
                    size={160} 
                    bgColor="#FFFFFF"
                    fgColor="#120E0C"
                    level="M"
                  />
                </div>
                <div className="text-[11px] font-mono text-[#D99B52]">
                  {cliente.rut ? `RUT: ${cliente.rut}` : cliente.telefono}
                </div>
              </div>
            )}

            <div className="bg-[#14100E]/95 border border-[#382B24] rounded-2xl p-5 shadow-inner">
              <div className="grid grid-cols-4 gap-3 place-items-center">
                {slots.map((_, index) => {
                  const estaSellado = index < cliente.sellos;
                  const esUltimo = index === cliente.meta - 1;

                  return (
                    <div
                      key={index}
                      className={`relative w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 ${
                        estaSellado
                          ? 'bg-gradient-to-br from-[#D99B52] to-[#B3762E] text-[#14100E] shadow-lg shadow-[#C98A42]/30 scale-100'
                          : 'bg-[#211A16] border border-dashed border-[#42332B] text-[#6E5D53]'
                      }`}
                    >
                      {estaSellado ? (
                        esUltimo ? (
                          <Sparkles className="w-6 h-6 stroke-[2.2] animate-pulse" />
                        ) : (
                          <Check className="w-6 h-6 stroke-[3]" />
                        )
                      ) : esUltimo ? (
                        <Star className="w-5 h-5 text-[#A89A90] stroke-[1.8]" />
                      ) : (
                        <span className="text-xs font-bold font-mono tracking-tighter">{index + 1}</span>
                      )}

                      {esUltimo && !estaSellado && (
                        <span className="absolute -bottom-1 text-[8px] font-bold tracking-wider uppercase text-[#D99B52] bg-[#14100E] px-1.5 py-0.2 rounded-full border border-[#42332B]">
                          Premio
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 space-y-2">
                <div className="flex justify-between text-xs font-medium text-[#A89A90]">
                  <span>Progreso de visitas</span>
                  <span className="text-[#D99B52] font-bold">{cliente.sellos} de {cliente.meta} sellos</span>
                </div>
                <div className="w-full bg-[#231B17] h-2.5 rounded-full overflow-hidden p-0.5 border border-[#3E3029]">
                  <div
                    className="bg-gradient-to-r from-[#B3762E] to-[#D99B52] h-full rounded-full transition-all duration-500 shadow-sm"
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-[#241D19]/90 border border-[#4A3B32] rounded-2xl p-4 flex items-start gap-3.5 shadow-md">
              <div className="p-2.5 bg-[#C98A42]/20 border border-[#C98A42]/40 rounded-xl text-[#D99B52] mt-0.5">
                <Award className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#D99B52]">Recompensa Activa</h4>
                <p className="text-sm font-semibold text-[#F5EDE2] mt-0.5 leading-snug">{cliente.premio}</p>
                <p className="text-xs text-[#A89A90] mt-1">
                  {esCompletada
                    ? "¡Meta alcanzada! Presenta esta pantalla en caja para canjear tu premio."
                    : `Acumula ${cliente.meta - cliente.sellos} visitas más para desbloquearlo.`}
                </p>
              </div>
            </div>

          </div>
        )}

        {/* ================= VISTA REGISTRO ================= */}
        {vista === 'registro' && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-5">
            <div className="border-b border-[#332822] pb-3 text-center">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#D99B52] uppercase">
                Bienvenido
              </span>
              <h2 className="text-xl font-black text-[#F5EDE2] mt-0.5">Únete al Club Brundeis</h2>
              <p className="text-xs text-[#A89A90] mt-1">
                Recibe tu <strong className="text-[#D99B52]">primer sello gratis</strong> de bienvenida.
              </p>
            </div>

            <form onSubmit={registrarCliente} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider block mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Camila Silva"
                  required
                  value={formRegistro.nombre}
                  onChange={(e) => setFormRegistro({ ...formRegistro, nombre: e.target.value })}
                  className="w-full bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3 text-sm text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider">
                    RUT
                  </label>
                  <span className="text-[10px] text-[#A89A90]">Formato automático</span>
                </div>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="Ej: 19.876.543-2"
                  value={formRegistro.rut}
                  onChange={handleRutChange}
                  className="w-full bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3 text-sm font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition tracking-wider"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider">
                    Celular (Chile)
                  </label>
                  <span className="text-[10px] text-[#A89A90]">+56 9 fijo</span>
                </div>
                <input
                  type="tel"
                  maxLength={17}
                  placeholder="+56 9 1234 5678"
                  value={formRegistro.telefono}
                  onChange={handleTelefonoChange}
                  className="w-full bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3 text-sm font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition tracking-wider"
                />
              </div>

              {mensajeRegistro && (
                <p className="text-xs text-[#E57373] text-center font-medium">{mensajeRegistro}</p>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="w-full py-4 bg-gradient-to-r from-[#B3762E] to-[#D99B52] hover:brightness-110 text-[#14100E] font-bold rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-[#C98A42]/25 transition"
              >
                <span>{cargando ? "Creando tarjeta..." : "Crear mi Tarjeta Digital"}</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </form>
          </div>
        )}

        {/* ================= VISTA CAJA ================= */}
        {vista === 'caja' && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-6">
            <div className="border-b border-[#332822] pb-3 flex justify-between items-end">
              <div>
                <h2 className="text-xl font-bold text-[#F5EDE2]">Terminal de Barra</h2>
                <p className="text-xs text-[#A89A90]">Buscar por RUT o Celular</p>
              </div>
              <button
                onClick={() => setVista('registro')}
                className="text-[11px] text-[#D99B52] hover:underline flex items-center gap-1 font-semibold"
              >
                <UserPlus className="w-3.5 h-3.5" />
                + Nuevo
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider block">
                RUT o Celular del Cliente
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ej: 29.405.670-K ó 982991805"
                  value={inputBusqueda}
                  onChange={(e) => setInputBusqueda(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscarCliente(inputBusqueda)}
                  className="flex-1 bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3 text-sm font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition"
                />
                <button
                  onClick={() => buscarCliente(inputBusqueda)}
                  disabled={cargando || !inputBusqueda}
                  className="bg-[#241D19] border border-[#4A3B32] hover:bg-[#2F241F] text-[#D99B52] px-4 rounded-xl flex items-center justify-center transition"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
              {mensajeCaja && (
                <p className="text-xs text-[#D99B52] font-medium pt-1">{mensajeCaja}</p>
              )}
            </div>

            <div className="bg-[#241D19] border border-[#3E3029] rounded-2xl p-4 space-y-2.5 shadow-sm">
              <div className="flex justify-between text-xs text-[#A89A90]">
                <span>Cliente cargado:</span>
                <span className="text-[#F5EDE2] font-semibold flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-[#D99B52]" />
                  {cliente.nombre}
                </span>
              </div>
              <div className="flex justify-between text-xs text-[#A89A90]">
                <span>RUT:</span>
                <span className="font-mono text-[#D99B52]">{cliente.rut || 'No registrado'}</span>
              </div>
              <div className="flex justify-between text-xs text-[#A89A90]">
                <span>Teléfono:</span>
                <span className="font-mono text-[#A89A90]">{cliente.telefono || 'No registrado'}</span>
              </div>
              <div className="flex justify-between text-xs text-[#A89A90]">
                <span>Progreso:</span>
                <span className="text-[#D99B52] font-bold text-sm">{cliente.sellos} / {cliente.meta}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={sumarSello}
                disabled={esCompletada || cargando}
                className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm tracking-wide transition-all ${
                  esCompletada || cargando
                    ? 'bg-[#241D19] text-[#6E5D53] cursor-not-allowed border border-[#382B24]'
                    : 'bg-gradient-to-r from-[#B3762E] to-[#D99B52] hover:brightness-110 text-[#14100E] shadow-lg shadow-[#C98A42]/25 active:scale-98'
                }`}
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
                {cargando ? "Guardando en Supabase..." : "Acreditar Visita (+1 Sello)"}
              </button>

              {esCompletada && (
                <button
                  onClick={canjearPremio}
                  disabled={cargando}
                  className="w-full py-3.5 bg-[#241D19] hover:bg-[#2C231E] border border-[#C98A42]/50 rounded-2xl font-semibold flex items-center justify-center gap-2 text-xs text-[#F5EDE2] transition"
                >
                  <RefreshCw className="w-4 h-4 text-[#D99B52]" />
                  Canjear Premio y Abrir Nueva Tarjeta
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}