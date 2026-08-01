--
-- PostgreSQL database dump
--

\restrict uxY6YvPgqbI7Jn2cIkWiXX9HHVk9NmhXfsc7Yl0VOAlU4dI2lf6a07b1sGq6v0C

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Debian 17.10-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: basket; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.basket (
    id bigint NOT NULL,
    basket_id character varying(50) NOT NULL,
    prescription_id bigint,
    machine_id integer,
    is_lit smallint DEFAULT 0,
    station_status integer DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: basket_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.basket_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: basket_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.basket_id_seq OWNED BY public.basket.id;


--
-- Name: cobot_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cobot_task (
    id bigint NOT NULL,
    task_no character varying(64) NOT NULL,
    machine_id integer NOT NULL,
    cobot_id character varying(50) NOT NULL,
    prescription_id bigint NOT NULL,
    pre_id character varying(50),
    split_id integer DEFAULT 1,
    basket_id character varying(50),
    task_state smallint DEFAULT 0,
    task_error_id character varying(20) DEFAULT '0'::character varying,
    task_message character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: cobot_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cobot_task_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cobot_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cobot_task_id_seq OWNED BY public.cobot_task.id;


--
-- Name: department_dictionary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_dictionary (
    id bigint NOT NULL,
    dept_code character varying(50) NOT NULL,
    dept_name character varying(255) NOT NULL,
    dept_py character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sync_status character varying(20) DEFAULT 'synced'::character varying NOT NULL
);


--
-- Name: department_dictionary_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.department_dictionary_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: department_dictionary_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.department_dictionary_id_seq OWNED BY public.department_dictionary.id;


--
-- Name: machine_part_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.machine_part_status (
    id bigint NOT NULL,
    machine_status_id bigint NOT NULL,
    part_name character varying(100),
    part_state smallint NOT NULL,
    part_message character varying(255)
);


--
-- Name: machine_part_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.machine_part_status_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_part_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.machine_part_status_id_seq OWNED BY public.machine_part_status.id;


--
-- Name: machine_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.machine_status (
    id bigint NOT NULL,
    machine_id integer NOT NULL,
    machine_state smallint NOT NULL,
    machine_message character varying(255),
    "timestamp" timestamp without time zone NOT NULL
);


--
-- Name: machine_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.machine_status_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.machine_status_id_seq OWNED BY public.machine_status.id;


--
-- Name: medicine_dictionary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medicine_dictionary (
    id bigint NOT NULL,
    medicinehisid character varying(50) NOT NULL,
    medicinenamech character varying(255) NOT NULL,
    medicinenameen character varying(255),
    medicineunit character varying(50) NOT NULL,
    medicinestate smallint DEFAULT 1,
    medfactoryid character varying(50),
    medfactoryname character varying(255) NOT NULL,
    typeunit character varying(50) NOT NULL,
    hpmtypeunit character varying(50) NOT NULL,
    numcode character varying(50),
    pycode character varying(100) NOT NULL,
    boxmaxnum integer DEFAULT 1 NOT NULL,
    medposition character varying(100),
    med_batch character varying(100),
    validate_time date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    dispense_type character varying(255) DEFAULT 'manual'::character varying,
    med_unit_capacity integer,
    sync_status character varying(20) DEFAULT 'synced'::character varying NOT NULL
);


--
-- Name: medicine_dictionary_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medicine_dictionary_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medicine_dictionary_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medicine_dictionary_id_seq OWNED BY public.medicine_dictionary.id;


--
-- Name: prescription_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prescription_detail (
    id bigint NOT NULL,
    prescription_id bigint NOT NULL,
    prescriptionhisid character varying(50) NOT NULL,
    medhisid character varying(50) NOT NULL,
    medunit character varying(50) NOT NULL,
    medicinenum integer DEFAULT 0 NOT NULL,
    medicineheteromorphism numeric(10,2) DEFAULT 0 NOT NULL,
    medicinehint character varying(500),
    medfactoryid character varying(50),
    medfactoryname character varying(255) NOT NULL,
    medicinenamech character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    drugspec character varying(255),
    drugpycode character varying(100),
    dosage character varying(50),
    dosageunit character varying(50),
    dosageperunit character varying(50),
    dispensingtime character varying(50),
    performtime character varying(50),
    performfreqdetail character varying(100),
    performfreq character varying(100),
    performfreqprint character varying(100),
    nursingcode character varying(100),
    priority smallint DEFAULT 4
);


--
-- Name: prescription_detail_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prescription_detail_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prescription_detail_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prescription_detail_id_seq OWNED BY public.prescription_detail.id;


--
-- Name: prescription_header; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prescription_header (
    id bigint NOT NULL,
    mzno character varying(50) NOT NULL,
    patientname character varying(255) NOT NULL,
    patientage integer NOT NULL,
    patientsex smallint NOT NULL,
    prescriptionhisid character varying(50) NOT NULL,
    prescriptiondoctorname character varying(255),
    prescriptionhint character varying(500),
    departmentname character varying(255),
    fetchwindow integer NOT NULL,
    basket_id character varying(50),
    pre_state smallint DEFAULT 0,
    delete_flag smallint DEFAULT 0,
    finish_time timestamp without time zone,
    notified_state smallint DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    pre_type character varying(255) DEFAULT '0'::character varying,
    patientbirthday character varying(20),
    patientvisitid character varying(50),
    patientbed character varying(50),
    doctorid character varying(50),
    administration character varying(100),
    repeatindicator character varying(10),
    deptcode character varying(50)
);


--
-- Name: prescription_header_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prescription_header_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prescription_header_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prescription_header_id_seq OWNED BY public.prescription_header.id;


--
-- Name: basket id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.basket ALTER COLUMN id SET DEFAULT nextval('public.basket_id_seq'::regclass);


--
-- Name: cobot_task id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobot_task ALTER COLUMN id SET DEFAULT nextval('public.cobot_task_id_seq'::regclass);


--
-- Name: department_dictionary id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_dictionary ALTER COLUMN id SET DEFAULT nextval('public.department_dictionary_id_seq'::regclass);


--
-- Name: machine_part_status id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machine_part_status ALTER COLUMN id SET DEFAULT nextval('public.machine_part_status_id_seq'::regclass);


--
-- Name: machine_status id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machine_status ALTER COLUMN id SET DEFAULT nextval('public.machine_status_id_seq'::regclass);


--
-- Name: medicine_dictionary id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine_dictionary ALTER COLUMN id SET DEFAULT nextval('public.medicine_dictionary_id_seq'::regclass);


--
-- Name: prescription_detail id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_detail ALTER COLUMN id SET DEFAULT nextval('public.prescription_detail_id_seq'::regclass);


--
-- Name: prescription_header id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_header ALTER COLUMN id SET DEFAULT nextval('public.prescription_header_id_seq'::regclass);


--
-- Data for Name: basket; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.basket (id, basket_id, prescription_id, machine_id, is_lit, station_status, updated_at) FROM stdin;
1	BASKET-01	78	\N	0	1	2026-07-23 14:03:09.233768
2	BASKET-02	77	\N	0	1	2026-07-23 14:03:11.221703
3	BASKET-03	76	\N	0	1	2026-07-23 14:03:12.573916
4	BASKET-04	75	\N	0	1	2026-07-23 14:03:17.504791
5	BASKET-05	74	\N	0	1	2026-07-23 14:03:19.233597
6	BASKET-06	79	\N	0	1	2026-07-23 14:04:33.07301
7	BASKET-07	81	\N	0	1	2026-07-23 14:04:45.72061
8	BASKET-08	80	\N	0	1	2026-07-23 14:04:48.535962
9	BASKET-09	84	\N	0	1	2026-07-23 14:04:58.032612
10	BASKET-10	83	\N	0	1	2026-07-23 14:05:00.695599
11	BASKET-11	82	\N	0	1	2026-07-23 14:05:02.572521
12	BASKET-12	86	\N	0	1	2026-07-23 14:05:25.459964
13	BASKET-13	85	\N	0	1	2026-07-23 14:05:30.011989
14	BASKET-14	88	\N	0	1	2026-07-23 14:05:36.799961
15	BASKET-15	87	\N	0	1	2026-07-23 14:05:39.531729
16	BASKET-16	101	\N	0	1	2026-07-24 00:41:49.134072
17	BASKET-17	100	\N	0	1	2026-07-24 00:41:54.697141
18	BASKET-18	103	\N	0	1	2026-07-24 00:42:06.565962
19	BASKET-19	102	\N	0	1	2026-07-24 00:42:09.273962
20	BASKET-20	104	\N	0	1	2026-07-24 00:42:14.928646
25	BASKET-25	\N	\N	0	0	2026-07-23 07:32:20.65921
26	BASKET-26	\N	\N	0	0	2026-07-23 07:32:20.65921
27	BASKET-27	\N	\N	0	0	2026-07-23 07:32:20.65921
28	BASKET-28	\N	\N	0	0	2026-07-23 07:32:20.65921
29	BASKET-29	\N	\N	0	0	2026-07-23 07:32:20.65921
30	BASKET-30	\N	\N	0	0	2026-07-23 07:32:20.65921
31	BASKET-31	\N	\N	0	0	2026-07-23 07:32:20.65921
32	BASKET-32	\N	\N	0	0	2026-07-23 07:32:20.65921
33	BASKET-33	\N	\N	0	0	2026-07-23 07:32:20.65921
34	BASKET-34	\N	\N	0	0	2026-07-23 07:32:20.65921
35	BASKET-35	\N	\N	0	0	2026-07-23 07:32:20.65921
36	BASKET-36	\N	\N	0	0	2026-07-23 07:32:20.65921
37	BASKET-37	\N	\N	0	0	2026-07-23 07:32:20.65921
38	BASKET-38	\N	\N	0	0	2026-07-23 07:32:20.65921
39	BASKET-39	\N	\N	0	0	2026-07-23 07:32:20.65921
40	BASKET-40	\N	\N	0	0	2026-07-23 07:32:20.65921
21	BASKET-21	\N	\N	0	0	2026-07-23 10:04:13.483276
22	BASKET-22	\N	\N	0	0	2026-07-23 10:04:13.483276
23	BASKET-23	\N	\N	0	0	2026-07-23 10:04:13.483276
24	BASKET-24	\N	\N	0	0	2026-07-23 10:04:13.483276
\.


--
-- Data for Name: cobot_task; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cobot_task (id, task_no, machine_id, cobot_id, prescription_id, pre_id, split_id, basket_id, task_state, task_error_id, task_message, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: department_dictionary; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.department_dictionary (id, dept_code, dept_name, dept_py, created_at, updated_at, sync_status) FROM stdin;
1	701	อายุรกรรม	ayurakam	2026-07-10 08:52:15.433727	2026-07-10 08:52:15.433727	pending
2	702	กุมารเวชกรรม	kumanwet	2026-07-10 08:52:15.433727	2026-07-10 08:52:15.433727	pending
3	703	สูตินรีเวชกรรม	sutinariwet	2026-07-10 08:52:15.433727	2026-07-10 08:52:15.433727	pending
4	704	ศัลยกรรม	sanyakam	2026-07-10 08:52:15.433727	2026-07-10 08:52:15.433727	pending
5	705	ห้องฉุกเฉิน	chukchoen	2026-07-10 08:52:15.433727	2026-07-10 08:52:15.433727	pending
6	706	ผิวหนัง	phiwnang	2026-07-10 08:52:38.008265	2026-07-10 08:52:38.008265	pending
\.


--
-- Data for Name: machine_part_status; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.machine_part_status (id, machine_status_id, part_name, part_state, part_message) FROM stdin;
\.


--
-- Data for Name: machine_status; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.machine_status (id, machine_id, machine_state, machine_message, "timestamp") FROM stdin;
\.


--
-- Data for Name: medicine_dictionary; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.medicine_dictionary (id, medicinehisid, medicinenamech, medicinenameen, medicineunit, medicinestate, medfactoryid, medfactoryname, typeunit, hpmtypeunit, numcode, pycode, boxmaxnum, medposition, med_batch, validate_time, created_at, updated_at, dispense_type, med_unit_capacity, sync_status) FROM stdin;
1	1309075162	ไซเมทิดีน	Cimetidine	200mg*10	1	133	Atlantic Laboratories	box	tablet	244	cimetidine	10	A-15	CMT2201	2027-04-18	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	rb1500	\N	synced
2	1309075163	โอเมพราโซล	Omeprazole Capsules	20mg*14	1	134	Milano Pharmaceutical	box	capsule	245	omeprazole	14	A-16	OMP0912	2027-06-05	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	rb1500	\N	synced
3	1309075164	เมทฟอร์มิน	Metformin	500mg	1	135	Greater Pharma	tablet	tablet	246	metformin	1	B-01	MTF7734	2027-09-22	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	nzp360	\N	synced
4	1309075165	ซิมวาสแตติน	Simvastatin	10mg	1	136	Biolab	tablet	tablet	247	simvastatin	1	B-02	SMV5521	2027-07-30	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	nzp360	\N	synced
5	1309075166	วิตามินบีรวม	Vitamin B Complex	1 tab	1	137	Pharmasant	tablet	tablet	248	vitaminb	1	B-03	VTB4432	2027-03-14	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	nzp360	\N	synced
6	1309075167	มอร์ฟีน	Morphine Sulfate Injection	10mg/1ml	1	138	Government Pharmaceutical Organization	ampoule	ampoule	249	morphine	1	D-10	MOR1123	2026-08-01	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	cobot	\N	synced
7	1309075168	มิดาโซแลม	Midazolam Injection	5mg/5ml	1	139	Central Poly Trading	ampoule	ampoule	250	midazolam	1	D-11	MDZ8890	2026-10-15	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	cobot	\N	synced
8	1309075169	น้ำเกลือ NSS	Normal Saline Solution 0.9%	1000ml	1	140	Thai Otsuka Pharmaceutical	bag	bag	251	nss	1	D-12	NSS0034	2027-11-30	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	cobot	\N	synced
9	1309075170	คลอเฟนิรามีน ไซรัป	Chlorpheniramine Syrup	2mg/5ml*60ml	1	141	T.Man Pharma	bottle	ml	252	chlorpheniramine	1	C-11	CPM6612	2027-02-08	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	manual	\N	synced
10	1309075171	ผงเกลือแร่ ORS	Oral Rehydration Salts	5g/sachet	1	142	Union Drug Laboratories	box	sachet	253	ors	50	E-02	ORS0091	2027-01-12	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	manual	\N	synced
11	1309075172	ครีมสเตียรอยด์	Betamethasone Cream	15g/tube	1	143	Union Drug Laboratories	tube	tube	254	betamethasone	1	F-01	BTM2245	2027-05-25	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	manual	\N	synced
13	1309075174	ลอราทาดีน	Loratadine	10mg	1	145	Biolab	tablet	tablet	256	loratadine	1	B-04	LRT7712	2027-08-09	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	nzp360	\N	synced
14	1309075175	เมโธเทรกเซท	Methotrexate Injection	50mg/2ml	1	146	Pfizer	vial	vial	257	methotrexate	1	D-15	MTX0021	2026-09-05	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	cobot	\N	synced
15	1309075176	ยาหยอดตาไทมอลอล	Timolol Eye Drops	0.5%*5ml	1	147	Alcon Laboratories	bottle	ml	258	timolol	1	F-05	TIM4478	2027-04-30	2026-07-10 08:56:46.757069	2026-07-10 08:56:46.757069	manual	\N	synced
42	911_1	Atropine 0.6 mg/mlinj.(1ml.)_ก	\N	0.6 mg/mL	1	\N	องค์การเภสัชกรรม	ampoule	ampoule	3422	atro	1		GGHT433	2026-07-30	2026-07-22 13:57:32.758487	2026-07-23 14:01:56.954798	cobot	1	synced
39	113121709105974801	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	\N	500 mg/10 mL	1	\N	PINYO PHARMACY	box	vial	113121709105974801	suxa	1	\N	GD2234	2026-07-30	2026-07-22 13:57:32.73504	2026-07-23 14:01:56.955679	manual	1	synced
32	323031511325067001	Manidipine 20 mg tab_(berlin)_ข	\N	20 mg	1	\N	BERLIN	pill	pill	\N	323031511325067001	1	34	IDT0070	2026-07-20	2026-07-21 23:56:55.116536	2026-07-23 05:24:43.120361	nzp360	1	synced
12	1309075173	แรนิทิดีน	Ranitidine	150mg*10	1	144	Atlantic Laboratories	box	tablet	255	ranitidine	10	A-17	RNT3391	2026-12-18	2026-07-10 08:56:46.757069	2026-07-21 07:21:38.9565	rb1500	\N	synced
19	324102210135933701	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	\N	1.5 g	1	\N	CALTAB (มิลลิเมด)	tablet	tablet	\N	calc	1	\N	\N	2026-07-20	2026-07-21 07:21:38.944376	2026-07-21 13:53:32.755695	manual	\N	synced
16	1364_1	20_mg_ENALAPRIL_TAB_ก		20 mg	1	24773	ANAPRIL 20 (เบอร์ลินฟาร์มาซูติคอลอินดัสตรี้)	tablet	tablet	\N	enlp	1	\N	\N	2026-07-18	2026-07-21 06:42:49.487852	2026-07-21 13:53:32.78298	nzp360	\N	synced
30	321100913140468301	OMEPRAZOLE_40 mg (ฉีด) inj._ข (Great)	\N	40 mg	1	1223	ZUELLIG (Great Eastern Drug)	box	box	321100913140468301	uuid	1	34	TAD4454	2026-07-22	2026-07-21 19:00:41.259969	2026-07-21 19:00:41.259969	rb1500	1	pending
31	12432_1	Aspirin_81 mg tab_ก	\N	81 mg	1	\N	DIETHELM Keller (British Dispensary)	box	pill	22332	ashs	30	89	AT984493	2026-07-22	2026-07-21 23:52:00.207092	2026-07-21 23:52:00.207092	rb1500	1	pending
34	316011510250542801	TRAMAdol  50 mg TAB_ค	\N	50 mg	1	\N	CENTRAL POLY TRADING CO., LTD.	box	pill	\N	316011510250542801	70	545	AT986493	2026-07-27	2026-07-22 00:03:31.418066	2026-07-23 05:24:43.122091	nzp360	1	synced
35	324102210135933701	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	\N	1500 mg	1	\N	บริษัท พรอส ฟาร์มา จำกัด	pill	pill	76565	324102210135933701	1	87	TBD4454	2026-07-27	2026-07-22 00:03:31.438884	2026-07-23 05:24:43.144183	nzp360	1	synced
33	1616_1	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	\N	0.5 mg	1	\N	POLIPHARM	pill	pill	\N	1616_1	1	76	GDI4453	2026-07-27	2026-07-22 00:03:31.417904	2026-07-23 05:24:43.150151	nzp360	1	synced
41	114051414152771401	Aspirin 325mg tab_ก(อังกฤษตรางู)	\N	325 mg	1	\N	DIETHELM Keller (British Dispensary)	pill	pill	114051414152771401	aspi	1	A6	HG2234	2026-07-21	2026-07-22 13:57:32.754352	2026-07-23 14:01:56.945971	nzp360	1	synced
40	1388_1	Ephedrine 30 mg/ml _inj(1ml)_ค	\N	30 mg/mL	1	\N	กองควบคุมวัตถุเสพติดฯ	box	vial	\N	ephe	1	3-5-5	GGTF443	2026-07-29	2026-07-22 13:57:32.753507	2026-07-23 14:01:56.945971	rb1500	1	synced
\.


--
-- Data for Name: prescription_detail; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.prescription_detail (id, prescription_id, prescriptionhisid, medhisid, medunit, medicinenum, medicineheteromorphism, medicinehint, medfactoryid, medfactoryname, medicinenamech, created_at, drugspec, drugpycode, dosage, dosageunit, dosageperunit, dispensingtime, performtime, performfreqdetail, performfreq, performfreqprint, nursingcode, priority) FROM stdin;
66	23	MOCK1783677521125	1309075172	15g/tube	8	0.00	On empty stomach	143	Union Drug Laboratories	ครีมสเตียรอยด์	2026-07-10 09:58:41.806995	15g/tube	betamethasone	1	mg	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	609613257487	4
67	23	MOCK1783677521125	1309075166	1 tab	2	0.00	Before meal	137	Pharmasant	วิตามินบีรวม	2026-07-10 09:58:41.806995	1 tab	vitaminb	2	Capsule	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	336886016275	4
68	23	MOCK1783677521125	1309075175	50mg/2ml	28	0.00	Before meal	146	Pfizer	เมโธเทรกเซท	2026-07-10 09:58:41.806995	50mg/2ml	methotrexate	1	Capsule	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	499585278717	4
69	23	MOCK1783677521125	1309075164	500mg	19	0.00	With plenty of water	135	Greater Pharma	เมทฟอร์มิน	2026-07-10 09:58:41.806995	500mg	metformin	2	Capsule	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	805968569656	4
70	23	MOCK1783677521125	1309075165	10mg	28	0.00	Before meal	136	Biolab	ซิมวาสแตติน	2026-07-10 09:58:41.806995	10mg	simvastatin	2	Tablet	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	468947546191	4
72	23	MOCK1783677521125	1309075170	2mg/5ml*60ml	14	0.00	With plenty of water	141	T.Man Pharma	คลอเฟนิรามีน ไซรัป	2026-07-10 09:58:41.806995	2mg/5ml*60ml	chlorpheniramine	1	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	999355106910	4
75	24	MOCK1783677522648	1309075166	1 tab	21	0.00	Before bed	137	Pharmasant	วิตามินบีรวม	2026-07-10 09:58:42.31557	1 tab	vitaminb	1	mg	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	859883348819	4
78	24	MOCK1783677522648	1309075176	0.5%*5ml	14	0.00	After meal	147	Alcon Laboratories	ยาหยอดตาไทมอลอล	2026-07-10 09:58:42.31557	0.5%*5ml	timolol	2	mg	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	998457553334	4
79	24	MOCK1783677522648	1309075170	2mg/5ml*60ml	29	0.00	After meal	141	T.Man Pharma	คลอเฟนิรามีน ไซรัป	2026-07-10 09:58:42.31557	2mg/5ml*60ml	chlorpheniramine	1	mg	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	313159896432	4
80	24	MOCK1783677522648	1309075168	5mg/5ml	24	0.00	Before meal	139	Central Poly Trading	มิดาโซแลม	2026-07-10 09:58:42.31557	5mg/5ml	midazolam	2	mg	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	171009473798	4
81	24	MOCK1783677522648	1309075172	15g/tube	12	0.00	Before bed	143	Union Drug Laboratories	ครีมสเตียรอยด์	2026-07-10 09:58:42.31557	15g/tube	betamethasone	1	mg	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	392676177946	4
65	23	MOCK1783677521125	1309075171	5g/sachet	0	3.00	Before meal	142	Union Drug Laboratories	ผงเกลือแร่ ORS	2026-07-10 09:58:41.806995	5g/sachet	ors	1	mg	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	353580997319	4
83	24	MOCK1783677522648	1309075169	1000ml	3	0.00	After meal	140	Thai Otsuka Pharmaceutical	น้ำเกลือ NSS	2026-07-10 09:58:42.31557	1000ml	nss	2	Capsule	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	513489971650	4
85	25	MOCK1783677522686	1309075166	1 tab	11	0.00	Before bed	137	Pharmasant	วิตามินบีรวม	2026-07-10 09:58:42.821026	1 tab	vitaminb	2	Tablet	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	822170089768	4
86	25	MOCK1783677522686	1309075168	5mg/5ml	15	0.00	Before bed	139	Central Poly Trading	มิดาโซแลม	2026-07-10 09:58:42.821026	5mg/5ml	midazolam	1	ml	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	191540329063	4
89	25	MOCK1783677522686	1309075165	10mg	14	0.00	With plenty of water	136	Biolab	ซิมวาสแตติน	2026-07-10 09:58:42.821026	10mg	simvastatin	2	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	541838832612	4
90	25	MOCK1783677522686	1309075164	500mg	3	0.00	Before meal	135	Greater Pharma	เมทฟอร์มิน	2026-07-10 09:58:42.821026	500mg	metformin	2	ml	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	681768975342	4
92	26	MOCK1783677523715	1309075176	0.5%*5ml	30	0.00	Before bed	147	Alcon Laboratories	ยาหยอดตาไทมอลอล	2026-07-10 09:58:43.217016	0.5%*5ml	timolol	2	Tablet	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	595528419943	4
94	26	MOCK1783677523715	1309075168	5mg/5ml	13	0.00	After meal	139	Central Poly Trading	มิดาโซแลม	2026-07-10 09:58:43.217016	5mg/5ml	midazolam	1	Tablet	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	145677418756	4
95	26	MOCK1783677523715	1309075167	10mg/1ml	3	0.00	Before meal	138	Government Pharmaceutical Organization	มอร์ฟีน	2026-07-10 09:58:43.217016	10mg/1ml	morphine	2	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	491706228085	4
96	26	MOCK1783677523715	1309075172	15g/tube	7	0.00	On empty stomach	143	Union Drug Laboratories	ครีมสเตียรอยด์	2026-07-10 09:58:43.217016	15g/tube	betamethasone	1	ml	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	727504063466	4
97	26	MOCK1783677523715	1309075169	1000ml	26	0.00	On empty stomach	140	Thai Otsuka Pharmaceutical	น้ำเกลือ NSS	2026-07-10 09:58:43.217016	1000ml	nss	2	mg	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	383031193083	4
98	26	MOCK1783677523715	1309075164	500mg	12	0.00	Before meal	135	Greater Pharma	เมทฟอร์มิน	2026-07-10 09:58:43.217016	500mg	metformin	2	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	403647609073	4
99	27	MOCK1783677523169	1309075174	10mg	16	0.00	On empty stomach	145	Biolab	ลอราทาดีน	2026-07-10 09:58:43.647532	10mg	loratadine	1	Tablet	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	490280620560	4
101	27	MOCK1783677523169	1309075164	500mg	24	0.00	On empty stomach	135	Greater Pharma	เมทฟอร์มิน	2026-07-10 09:58:43.647532	500mg	metformin	1	Capsule	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	156779189434	4
102	27	MOCK1783677523169	1309075166	1 tab	7	0.00	On empty stomach	137	Pharmasant	วิตามินบีรวม	2026-07-10 09:58:43.647532	1 tab	vitaminb	1	mg	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	745873770781	4
103	27	MOCK1783677523169	1309075172	15g/tube	18	0.00	With plenty of water	143	Union Drug Laboratories	ครีมสเตียรอยด์	2026-07-10 09:58:43.647532	15g/tube	betamethasone	1	Capsule	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	450404013359	4
104	27	MOCK1783677523169	1309075170	2mg/5ml*60ml	6	0.00	With plenty of water	141	T.Man Pharma	คลอเฟนิรามีน ไซรัป	2026-07-10 09:58:43.647532	2mg/5ml*60ml	chlorpheniramine	1	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	336481466337	4
105	27	MOCK1783677523169	1309075169	1000ml	17	0.00	Before bed	140	Thai Otsuka Pharmaceutical	น้ำเกลือ NSS	2026-07-10 09:58:43.647532	1000ml	nss	2	ml	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	350480746809	4
106	27	MOCK1783677523169	1309075168	5mg/5ml	19	0.00	Before meal	139	Central Poly Trading	มิดาโซแลม	2026-07-10 09:58:43.647532	5mg/5ml	midazolam	2	Capsule	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	380850061278	4
107	27	MOCK1783677523169	1309075167	10mg/1ml	13	0.00	On empty stomach	138	Government Pharmaceutical Organization	มอร์ฟีน	2026-07-10 09:58:43.647532	10mg/1ml	morphine	2	Tablet	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	942598118584	4
111	28	MOCK1783677523906	1309075164	500mg	6	0.00	On empty stomach	135	Greater Pharma	เมทฟอร์มิน	2026-07-10 09:58:44.114063	500mg	metformin	2	Capsule	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	639658566872	4
112	28	MOCK1783677523906	1309075172	15g/tube	29	0.00	Before bed	143	Union Drug Laboratories	ครีมสเตียรอยด์	2026-07-10 09:58:44.114063	15g/tube	betamethasone	1	mg	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	785613186969	4
114	28	MOCK1783677523906	1309075166	1 tab	30	0.00	Before bed	137	Pharmasant	วิตามินบีรวม	2026-07-10 09:58:44.114063	1 tab	vitaminb	2	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	211626340532	4
115	28	MOCK1783677523906	1309075165	10mg	28	0.00	After meal	136	Biolab	ซิมวาสแตติน	2026-07-10 09:58:44.114063	10mg	simvastatin	1	ml	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	411630621418	4
116	28	MOCK1783677523906	1309075175	50mg/2ml	1	0.00	After meal	146	Pfizer	เมโธเทรกเซท	2026-07-10 09:58:44.114063	50mg/2ml	methotrexate	1	ml	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	219881204105	4
109	28	MOCK1783677523906	1309075176	0.5%*5ml	22	0.00	Before meal	147	Alcon Laboratories	ยาหยอดตาไทมอลอล	2026-07-10 09:58:44.114063	0.5%*5ml	timolol	2	Tablet	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	946955386115	4
118	29	MOCK1783677524810	1309075165	10mg	29	0.00	Before bed	136	Biolab	ซิมวาสแตติน	2026-07-10 09:58:44.581396	10mg	simvastatin	2	Capsule	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	638536645599	4
119	29	MOCK1783677524810	1309075166	1 tab	13	0.00	On empty stomach	137	Pharmasant	วิตามินบีรวม	2026-07-10 09:58:44.581396	1 tab	vitaminb	1	Tablet	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	327225142143	4
120	29	MOCK1783677524810	1309075176	0.5%*5ml	12	0.00	With plenty of water	147	Alcon Laboratories	ยาหยอดตาไทมอลอล	2026-07-10 09:58:44.581396	0.5%*5ml	timolol	1	ml	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	302704670172	4
121	29	MOCK1783677524810	1309075168	5mg/5ml	29	0.00	With plenty of water	139	Central Poly Trading	มิดาโซแลม	2026-07-10 09:58:44.581396	5mg/5ml	midazolam	1	mg	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	510180738617	4
122	29	MOCK1783677524810	1309075164	500mg	11	0.00	With plenty of water	135	Greater Pharma	เมทฟอร์มิน	2026-07-10 09:58:44.581396	500mg	metformin	1	Capsule	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	337709329554	4
123	29	MOCK1783677524810	1309075167	10mg/1ml	15	0.00	Before meal	138	Government Pharmaceutical Organization	มอร์ฟีน	2026-07-10 09:58:44.581396	10mg/1ml	morphine	1	ml	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	993510581891	4
124	30	MOCK1783677524964	1309075176	0.5%*5ml	24	0.00	With plenty of water	147	Alcon Laboratories	ยาหยอดตาไทมอลอล	2026-07-10 09:58:44.97786	0.5%*5ml	timolol	1	Tablet	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	159893162555	4
125	30	MOCK1783677524964	1309075175	50mg/2ml	22	0.00	Before bed	146	Pfizer	เมโธเทรกเซท	2026-07-10 09:58:44.97786	50mg/2ml	methotrexate	1	Tablet	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	748209604642	4
137	31	MOCK1783677525216	1309075174	10mg	14	0.00	With plenty of water	145	Biolab	ลอราทาดีน	2026-07-10 09:58:45.450951	10mg	loratadine	2	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	606954512840	4
138	31	MOCK1783677525216	1309075176	0.5%*5ml	29	0.00	With plenty of water	147	Alcon Laboratories	ยาหยอดตาไทมอลอล	2026-07-10 09:58:45.450951	0.5%*5ml	timolol	2	ml	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	123215662035	4
139	31	MOCK1783677525216	1309075168	5mg/5ml	7	0.00	On empty stomach	139	Central Poly Trading	มิดาโซแลม	2026-07-10 09:58:45.450951	5mg/5ml	midazolam	2	mg	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	432515374183	4
140	31	MOCK1783677525216	1309075167	10mg/1ml	7	0.00	On empty stomach	138	Government Pharmaceutical Organization	มอร์ฟีน	2026-07-10 09:58:45.450951	10mg/1ml	morphine	2	Tablet	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	922657183273	4
141	31	MOCK1783677525216	1309075172	15g/tube	13	0.00	After meal	143	Union Drug Laboratories	ครีมสเตียรอยด์	2026-07-10 09:58:45.450951	15g/tube	betamethasone	2	mg	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	754208835311	4
126	30	MOCK1783677524964	1309075172	15g/tube	26	0.00	Before bed	143	Union Drug Laboratories	ครีมสเตียรอยด์	2026-07-10 09:58:44.97786	15g/tube	betamethasone	1	Tablet	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	813440687213	4
71	23	MOCK1783677521125	1309075162	200mg*10	2	7.00	On empty stomach	133	Atlantic Laboratories	ไซเมทิดีน	2026-07-10 09:58:41.806995	200mg*10	cimetidine	1	mg	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	573004011457	4
134	31	MOCK1783677525216	1309075163	20mg*14	0	9.00	Before meal	134	Milano Pharmaceutical	โอเมพราโซล	2026-07-10 09:58:45.450951	20mg*14	omeprazole	1	Capsule	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	684693919388	4
73	23	MOCK1783677521125	1309075163	20mg*14	0	4.00	After meal	134	Milano Pharmaceutical	โอเมพราโซล	2026-07-10 09:58:41.806995	20mg*14	omeprazole	1	Tablet	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	245952013183	4
74	24	MOCK1783677522648	1309075173	150mg*10	0	3.00	After meal	144	Atlantic Laboratories	แรนิทิดีน	2026-07-10 09:58:42.31557	150mg*10	ranitidine	2	Tablet	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	250583261079	4
76	24	MOCK1783677522648	1309075162	200mg*10	1	9.00	With plenty of water	133	Atlantic Laboratories	ไซเมทิดีน	2026-07-10 09:58:42.31557	200mg*10	cimetidine	1	mg	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	632759165803	4
77	24	MOCK1783677522648	1309075171	5g/sachet	0	22.00	Before bed	142	Union Drug Laboratories	ผงเกลือแร่ ORS	2026-07-10 09:58:42.31557	5g/sachet	ors	2	ml	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	609758695745	4
84	25	MOCK1783677522686	1309075163	20mg*14	0	9.00	With plenty of water	134	Milano Pharmaceutical	โอเมพราโซล	2026-07-10 09:58:42.821026	20mg*14	omeprazole	2	mg	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	851371078912	4
87	25	MOCK1783677522686	1309075162	200mg*10	0	8.00	Before bed	133	Atlantic Laboratories	ไซเมทิดีน	2026-07-10 09:58:42.821026	200mg*10	cimetidine	1	Capsule	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	667089434625	4
88	25	MOCK1783677522686	1309075171	5g/sachet	0	9.00	After meal	142	Union Drug Laboratories	ผงเกลือแร่ ORS	2026-07-10 09:58:42.821026	5g/sachet	ors	2	Tablet	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	701097826391	4
91	26	MOCK1783677523715	1309075171	5g/sachet	0	7.00	After meal	142	Union Drug Laboratories	ผงเกลือแร่ ORS	2026-07-10 09:58:43.217016	5g/sachet	ors	2	Capsule	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	148425112689	4
93	26	MOCK1783677523715	1309075173	150mg*10	0	6.00	After meal	144	Atlantic Laboratories	แรนิทิดีน	2026-07-10 09:58:43.217016	150mg*10	ranitidine	1	mg	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	565215367000	4
100	27	MOCK1783677523169	1309075171	5g/sachet	0	17.00	On empty stomach	142	Union Drug Laboratories	ผงเกลือแร่ ORS	2026-07-10 09:58:43.647532	5g/sachet	ors	2	mg	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	118223761804	4
56	22	MOCK1783677521978	1309075165	10mg	11	0.00	With plenty of water	136	Biolab	ซิมวาสแตติน	2026-07-10 09:58:41.375755	10mg	simvastatin	2	Capsule	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	184730460810	4
145	33	MOCKTC-M-01-1784699981186	323031511325067001	20 mg	1	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:42.78677	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	20:00	Once per day	Night	458036473160	3
157	40	MOCKTC-M-08-1784699981186	324102210135933701	1500 mg	1	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 05:59:48.507312	1500 mg	caltab	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	08:00	Once per day	Morning	915700912293	3
59	22	MOCK1783677521978	1309075164	500mg	30	0.00	Before bed	135	Greater Pharma	เมทฟอร์มิน	2026-07-10 09:58:41.375755	500mg	metformin	2	Capsule	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	575686769112	4
60	22	MOCK1783677521978	1309075166	1 tab	8	0.00	Before meal	137	Pharmasant	วิตามินบีรวม	2026-07-10 09:58:41.375755	1 tab	vitaminb	2	ml	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	562183933114	4
61	22	MOCK1783677521978	1309075174	10mg	3	0.00	Before bed	145	Biolab	ลอราทาดีน	2026-07-10 09:58:41.375755	10mg	loratadine	2	mg	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	620856824015	4
180	53	MOCKTC-M-23-1784701266342	323031511325067001	20 mg	6	0.00	2 tablets per dose	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:21:07.787605	20 mg	manidipine	2	Tablet	1.0	2026072213:21:06	2026072213:21:06	8-12-18	3 times per day	Morning-noon-night	245946001275	3
63	22	MOCK1783677521978	1309075167	10mg/1ml	24	0.00	With plenty of water	138	Government Pharmaceutical Organization	มอร์ฟีน	2026-07-10 09:58:41.375755	10mg/1ml	morphine	1	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	734310815248	4
64	23	MOCK1783677521125	1309075167	10mg/1ml	10	0.00	On empty stomach	138	Government Pharmaceutical Organization	มอร์ฟีน	2026-07-10 09:58:41.806995	10mg/1ml	morphine	1	mg	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	178193889996	4
110	28	MOCK1783677523906	1309075163	20mg*14	1	2.00	On empty stomach	134	Milano Pharmaceutical	โอเมพราโซล	2026-07-10 09:58:44.114063	20mg*14	omeprazole	2	mg	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	454419618424	4
113	28	MOCK1783677523906	1309075171	5g/sachet	0	17.00	Before bed	142	Union Drug Laboratories	ผงเกลือแร่ ORS	2026-07-10 09:58:44.114063	5g/sachet	ors	2	ml	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	335154489137	4
117	29	MOCK1783677524810	1309075173	150mg*10	1	6.00	Before bed	144	Atlantic Laboratories	แรนิทิดีน	2026-07-10 09:58:44.581396	150mg*10	ranitidine	1	Tablet	0.3	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	906376013718	4
57	22	MOCK1783677521978	1309075173	150mg*10	1	6.00	After meal	144	Atlantic Laboratories	แรนิทิดีน	2026-07-10 09:58:41.375755	150mg*10	ranitidine	1	ml	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	806143180275	4
58	22	MOCK1783677521978	1309075162	200mg*10	0	3.00	Before meal	133	Atlantic Laboratories	ไซเมทิดีน	2026-07-10 09:58:41.375755	200mg*10	cimetidine	2	ml	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	402092427491	4
62	22	MOCK1783677521978	1309075163	20mg*14	1	5.00	With plenty of water	134	Milano Pharmaceutical	โอเมพราโซล	2026-07-10 09:58:41.375755	20mg*14	omeprazole	1	mg	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	311607274590	4
82	24	MOCK1783677522648	1309075167	10mg/1ml	16	0.00	Before meal	138	Government Pharmaceutical Organization	มอร์ฟีน	2026-07-10 09:58:42.31557	10mg/1ml	morphine	1	Tablet	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	142878548879	2
181	53	MOCKTC-M-23-1784701266342	1616_1	0.5 mg	2	0.00	1 tablet per dose	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:21:07.787605	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:21:06	2026072213:21:06	8-18	2 times per day	Morning-night	237071956917	3
182	53	MOCKTC-M-23-1784701266342	324102210135933701	1500 mg	6	0.00	3 tablets per dose	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:21:07.787605	1500 mg	caltab	3	Tablet	1.0	2026072213:21:06	2026072213:21:06	8-12	2 times per day	Morning-noon	310501824019	3
206	63	MOCKPOS-10-1784703453757-7108	324102210135933701	1500 mg	1	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:33.960861	1500 mg	caltab	1	Tablet	1.0	2026072213:57:33	2026072213:57:33	20:00	Once per day	Night	384123299032	4
207	64	MOCKPOS-11-1784703454803-2079	1616_1	0.5 mg	3	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:35.001631	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:34	2026072213:57:34	08:00-14:00-20:00	3 times per day	Morning-noon-night	949016385982	4
208	64	MOCKPOS-11-1784703454803-2079	323031511325067001	20 mg	3	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:35.001631	20 mg	manidipine	1	Tablet	1.0	2026072213:57:34	2026072213:57:34	08:00-14:00-20:00	3 times per day	Morning-noon-night	744687502049	4
209	65	MOCKPOS-12-1784703455669-3779	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:35.881343	20 mg	manidipine	1	Tablet	1.0	2026072213:57:35	2026072213:57:35	8-20	2 times per day	Morning-night	759382093545	4
210	65	MOCKPOS-12-1784703455669-3779	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:35.881343	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:35	2026072213:57:35	8-20	2 times per day	Morning-night	994012865143	4
143	32	MOCK1784698585792	1616_1	0.5 mg	2	0.00	Twice daily	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 05:36:27.132105	0.5 mg	lorazepam	1	Tablet	1.0	2026072212:36:25	2026072212:36:25	8-20	2 times per day	Morning-night	143496418655	3
144	32	MOCK1784698585792	316011510250542801	50 mg	0	1.00	Before bed, as needed for pain	\N	CENTRAL POLY TRADING CO., LTD.	TRAMAdol  50 mg TAB_ค	2026-07-22 05:36:27.132105	50 mg	tramadol	1	Tablet	1.0	2026072212:36:25	2026072212:36:25	qn	Once per day (Night)	Night	316926350028	3
183	54	MOCKPOS-01-1784703444253-7758	323031511325067001	20 mg	3	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:25.560615	20 mg	manidipine	1	Tablet	1.0	2026072213:57:24	2026072213:57:24	08:00-14:00-20:00	3 times per day	Morning-noon-night	466772512154	4
142	32	MOCK1784698585792	323031511325067001	20 mg	1	0.00	Once daily, morning	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:36:27.132105	20 mg	manidipine	1	Tablet	1.0	2026072212:36:25	2026072212:36:25	qd	Once per day	Morning	160255545017	3
184	54	MOCKPOS-01-1784703444253-7758	324102210135933701	1500 mg	3	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:25.560615	1500 mg	caltab	1	Tablet	1.0	2026072213:57:24	2026072213:57:24	08:00-14:00-20:00	3 times per day	Morning-noon-night	983433034204	4
185	54	MOCKPOS-01-1784703444253-7758	1616_1	0.5 mg	3	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:25.560615	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:24	2026072213:57:24	08:00-14:00-20:00	3 times per day	Morning-noon-night	462036480452	4
186	55	MOCKPOS-02-1784703446438-5425	323031511325067001	20 mg	1	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:26.641163	20 mg	manidipine	1	Tablet	1.0	2026072213:57:26	2026072213:57:26	20:00	Once per day	Night	820985458615	4
187	55	MOCKPOS-02-1784703446438-5425	324102210135933701	1500 mg	1	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:26.641163	1500 mg	caltab	1	Tablet	1.0	2026072213:57:26	2026072213:57:26	20:00	Once per day	Night	634593205592	4
188	55	MOCKPOS-02-1784703446438-5425	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:26.641163	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:26	2026072213:57:26	20:00	Once per day	Night	567032005063	4
189	56	MOCKPOS-03-1784703447488-3855	1616_1	0.5 mg	3	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:27.711017	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:27	2026072213:57:27	08:00-14:00-20:00	3 times per day	Morning-noon-night	221273457877	4
190	56	MOCKPOS-03-1784703447488-3855	323031511325067001	20 mg	3	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:27.711017	20 mg	manidipine	1	Tablet	1.0	2026072213:57:27	2026072213:57:27	08:00-14:00-20:00	3 times per day	Morning-noon-night	881598321602	4
191	57	MOCKPOS-04-1784703448393-8428	323031511325067001	20 mg	1	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:28.600594	20 mg	manidipine	1	Tablet	1.0	2026072213:57:28	2026072213:57:28	20:00	Once per day	Night	241186303615	4
192	57	MOCKPOS-04-1784703448393-8428	324102210135933701	1500 mg	1	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:28.600594	1500 mg	caltab	1	Tablet	1.0	2026072213:57:28	2026072213:57:28	20:00	Once per day	Night	610494113351	4
193	57	MOCKPOS-04-1784703448393-8428	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:28.600594	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:28	2026072213:57:28	20:00	Once per day	Night	333559533537	4
194	58	MOCKPOS-05-1784703449439-6995	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:29.641809	1500 mg	caltab	1	Tablet	1.0	2026072213:57:29	2026072213:57:29	8-20	2 times per day	Morning-night	724234157004	4
195	58	MOCKPOS-05-1784703449439-6995	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:29.641809	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:29	2026072213:57:29	8-20	2 times per day	Morning-night	567223372764	4
196	58	MOCKPOS-05-1784703449439-6995	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:29.641809	20 mg	manidipine	1	Tablet	1.0	2026072213:57:29	2026072213:57:29	8-20	2 times per day	Morning-night	598706284712	4
197	59	MOCKPOS-06-1784703450513-1180	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:30.721623	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:30	2026072213:57:30	8-20	2 times per day	Morning-night	173378765703	4
198	59	MOCKPOS-06-1784703450513-1180	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:30.721623	1500 mg	caltab	1	Tablet	1.0	2026072213:57:30	2026072213:57:30	8-20	2 times per day	Morning-night	925823674989	4
199	60	MOCKPOS-07-1784703451352-5847	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:31.550698	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:31	2026072213:57:31	8-20	2 times per day	Morning-night	867315698714	4
200	60	MOCKPOS-07-1784703451352-5847	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:31.550698	20 mg	manidipine	1	Tablet	1.0	2026072213:57:31	2026072213:57:31	8-20	2 times per day	Morning-night	416241183053	4
201	60	MOCKPOS-07-1784703451352-5847	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:31.550698	1500 mg	caltab	1	Tablet	1.0	2026072213:57:31	2026072213:57:31	8-20	2 times per day	Morning-night	836104117329	4
167	44	MOCKTC-M-12-1784699981186	323031511325067001	20 mg	30	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:52.536734	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41				779563473418	3
170	47	MOCKTC-M-15-1784699981186	323031511325067001	20 mg	30	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:54.656707	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	3601200	Once per day (DB usage_code)	3601200	510720933395	3
146	34	MOCKTC-M-02-1784699981186	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:43.506586	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-20	2 times per day	Morning-night	259398744671	3
147	35	MOCKTC-M-03-1784699981186	323031511325067001	20 mg	3	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:44.18711	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	08:30-12:30-18:30	3 times per day	Morning-noon-evening	225445933284	3
148	36	MOCKTC-M-04-1784699981186	323031511325067001	20 mg	4	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:45.256739	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-12-16-20	4 times per day	Morning-noon-evening-night	130825597826	3
149	37	MOCKTC-M-05-1784699981186	323031511325067001	20 mg	1	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:45.941924	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	20:00	Once per day	Night	767259682831	3
150	37	MOCKTC-M-05-1784699981186	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 05:59:45.941924	0.5 mg	lorazepam	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	20:00	Once per day	Night	586228329928	3
151	38	MOCKTC-M-06-1784699981186	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:46.806453	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-20	2 times per day	Morning-night	725481535230	3
152	38	MOCKTC-M-06-1784699981186	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 05:59:46.806453	0.5 mg	lorazepam	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-20	2 times per day	Morning-night	556189767069	3
153	39	MOCKTC-M-07-1784699981186	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:47.657027	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-20	2 times per day	Morning-night	128404006963	3
154	39	MOCKTC-M-07-1784699981186	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 05:59:47.657027	0.5 mg	lorazepam	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	08:00	Once per day	Morning	764588961193	3
155	40	MOCKTC-M-08-1784699981186	323031511325067001	20 mg	1	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:48.507312	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	08:00	Once per day	Morning	175809635644	3
156	40	MOCKTC-M-08-1784699981186	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 05:59:48.507312	0.5 mg	lorazepam	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	08:00	Once per day	Morning	495016111862	3
158	41	MOCKTC-M-09-1784699981186	323031511325067001	20 mg	3	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:49.536789	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-12-16	3 times per day	Morning-noon-evening	716634450092	3
159	41	MOCKTC-M-09-1784699981186	1616_1	0.5 mg	3	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 05:59:49.536789	0.5 mg	lorazepam	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-12-16	3 times per day	Morning-noon-evening	881819216955	3
160	41	MOCKTC-M-09-1784699981186	324102210135933701	1500 mg	3	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 05:59:49.536789	1500 mg	caltab	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-12-16	3 times per day	Morning-noon-evening	413842611496	3
161	42	MOCKTC-M-10-1784699981186	323031511325067001	20 mg	3	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:50.556707	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-12-18	3 times per day	Morning-noon-night	563355403100	3
162	42	MOCKTC-M-10-1784699981186	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 05:59:50.556707	0.5 mg	lorazepam	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-18	2 times per day	Morning-night	745599469392	3
163	42	MOCKTC-M-10-1784699981186	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 05:59:50.556707	1500 mg	caltab	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-12	2 times per day	Morning-noon	464249705690	3
164	43	MOCKTC-M-11-1784699981186	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:51.526591	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	08:30-12:30	2 times per day	Morning-noon	284204779752	3
165	43	MOCKTC-M-11-1784699981186	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 05:59:51.526591	0.5 mg	lorazepam	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-12	2 times per day	Morning-noon	246557035469	3
166	43	MOCKTC-M-11-1784699981186	324102210135933701	1500 mg	1	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 05:59:51.526591	1500 mg	caltab	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	20:00	Once per day	Night	423398047311	3
168	45	MOCKTC-M-13-1784699981186	323031511325067001	20 mg	1	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:53.21681	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	qd	Once per day (DB usage_code)	qd	768259507605	3
169	46	MOCKTC-M-14-1784699981186	323031511325067001	20 mg	1	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:53.976803	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	qn	Once per day (DB usage_code)	qn	814177352678	3
127	30	MOCK1783677524964	1309075162	200mg*10	1	0.00	With plenty of water	133	Atlantic Laboratories	ไซเมทิดีน	2026-07-10 09:58:44.97786	200mg*10	cimetidine	2	Tablet	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	352584951895	4
132	30	MOCK1783677524964	1309075171	5g/sachet	0	17.00	On empty stomach	142	Union Drug Laboratories	ผงเกลือแร่ ORS	2026-07-10 09:58:44.97786	5g/sachet	ors	1	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	891915696706	4
135	31	MOCK1783677525216	1309075171	5g/sachet	0	22.00	With plenty of water	142	Union Drug Laboratories	ผงเกลือแร่ ORS	2026-07-10 09:58:45.450951	5g/sachet	ors	1	Capsule	0.4	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	800438927730	4
173	48	MOCKTC-M-16-1784699981186	324102210135933701	1500 mg	30	0.00	PRN (as needed)	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 05:59:55.326532	1500 mg	caltab	1	Tablet	1.0	2026072212:59:41	2026072212:59:41				747650128146	3
171	48	MOCKTC-M-16-1784699981186	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:55.326532	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-20	2 times per day	Morning-night	700401443735	3
128	30	MOCK1783677524964	1309075169	1000ml	7	0.00	With plenty of water	140	Thai Otsuka Pharmaceutical	น้ำเกลือ NSS	2026-07-10 09:58:44.97786	1000ml	nss	1	Capsule	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	699301971788	4
129	30	MOCK1783677524964	1309075164	500mg	28	0.00	On empty stomach	135	Greater Pharma	เมทฟอร์มิน	2026-07-10 09:58:44.97786	500mg	metformin	2	mg	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	269338925261	4
130	30	MOCK1783677524964	1309075167	10mg/1ml	1	0.00	After meal	138	Government Pharmaceutical Organization	มอร์ฟีน	2026-07-10 09:58:44.97786	10mg/1ml	morphine	2	Capsule	0.1	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	956276358850	4
131	30	MOCK1783677524964	1309075168	5mg/5ml	11	0.00	With plenty of water	139	Central Poly Trading	มิดาโซแลม	2026-07-10 09:58:44.97786	5mg/5ml	midazolam	1	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	771275947387	4
172	48	MOCKTC-M-16-1784699981186	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 05:59:55.326532	0.5 mg	lorazepam	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	08:00	Once per day	Morning	680784599455	3
133	31	MOCK1783677525216	1309075165	10mg	2	0.00	Before bed	136	Biolab	ซิมวาสแตติน	2026-07-10 09:58:45.450951	10mg	simvastatin	2	Capsule	0.2	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	101124440060	4
108	28	MOCK1783677523906	1309075168	5mg/5ml	24	0.00	Before bed	139	Central Poly Trading	มิดาโซแลม	2026-07-10 09:58:44.114063	5mg/5ml	midazolam	2	Capsule	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	233789384336	4
174	49	MOCKTC-M-17-1784699981186	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:56.367273	20 mg	manidipine	2	Tablet	1.0	2026072212:59:41	2026072212:59:41	08:00	Once per day	Morning	510973556878	3
136	31	MOCK1783677525216	1309075169	1000ml	10	0.00	With plenty of water	140	Thai Otsuka Pharmaceutical	น้ำเกลือ NSS	2026-07-10 09:58:45.450951	1000ml	nss	2	mg	0.5	2026071008:00:00	2026071008:00:00	8-12-16-20	4 times per day	Morning-noon-evening-night	909758901412	4
179	52	MOCKTC-M-22-1784699981186	323031511325067001	20 mg	30	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:58.747865	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	XYZ123			668220578962	3
175	49	MOCKTC-M-17-1784699981186	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 05:59:56.367273	0.5 mg	lorazepam	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	08:00	Once per day	Morning	482263256539	3
176	50	MOCKTC-M-18-1784699981186	323031511325067001	20 mg	1	0.00	Morning dose	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:57.206597	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	08:00	Once per day	Morning	967985899239	3
177	50	MOCKTC-M-18-1784699981186	323031511325067001	20 mg	2	0.00	Night dose	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:57.206597	20 mg	manidipine	2	Tablet	1.0	2026072212:59:41	2026072212:59:41	20:00	Once per day	Night	913650580078	3
178	51	MOCKTC-M-21-1784699981186	323031511325067001	20 mg	6	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 05:59:58.066677	20 mg	manidipine	1	Tablet	1.0	2026072212:59:41	2026072212:59:41	8-20	2 times per day	Morning-night	359926931015	3
202	61	MOCKPOS-08-1784703452349-5043	324102210135933701	1500 mg	4	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:32.561528	1500 mg	caltab	1	Tablet	1.0	2026072213:57:32	2026072213:57:32	8-12-16-20	4 times per day	Morning-noon-evening-night	483066977235	4
203	62	MOCKPOS-09-1784703453044-4226	1616_1	0.5 mg	4	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:33.270987	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:33	2026072213:57:33	8-12-16-20	4 times per day	Morning-noon-evening-night	705791212753	4
204	63	MOCKPOS-10-1784703453757-7108	323031511325067001	20 mg	1	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:33.960861	20 mg	manidipine	1	Tablet	1.0	2026072213:57:33	2026072213:57:33	20:00	Once per day	Night	221026018464	4
205	63	MOCKPOS-10-1784703453757-7108	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:33.960861	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:33	2026072213:57:33	20:00	Once per day	Night	890593834591	4
211	65	MOCKPOS-12-1784703455669-3779	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:35.881343	1500 mg	caltab	1	Tablet	1.0	2026072213:57:35	2026072213:57:35	8-20	2 times per day	Morning-night	523534684518	4
212	66	MOCKPOS-13-1784703456715-6468	323031511325067001	20 mg	4	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:36.920652	20 mg	manidipine	1	Tablet	1.0	2026072213:57:36	2026072213:57:36	8-12-16-20	4 times per day	Morning-noon-evening-night	571159018316	4
213	66	MOCKPOS-13-1784703456715-6468	1616_1	0.5 mg	4	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:36.920652	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:36	2026072213:57:36	8-12-16-20	4 times per day	Morning-noon-evening-night	288578488021	4
214	67	MOCKPOS-14-1784703457515-7157	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:37.7214	20 mg	manidipine	1	Tablet	1.0	2026072213:57:37	2026072213:57:37	8-20	2 times per day	Morning-night	748954817101	4
215	67	MOCKPOS-14-1784703457515-7157	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:37.7214	1500 mg	caltab	1	Tablet	1.0	2026072213:57:37	2026072213:57:37	8-20	2 times per day	Morning-night	363982682853	4
216	67	MOCKPOS-14-1784703457515-7157	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:37.7214	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:37	2026072213:57:37	8-20	2 times per day	Morning-night	410166643080	4
217	68	MOCKPOS-15-1784703458565-9398	1616_1	0.5 mg	4	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:38.790789	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:38	2026072213:57:38	8-12-16-20	4 times per day	Morning-noon-evening-night	581251458975	4
218	68	MOCKPOS-15-1784703458565-9398	323031511325067001	20 mg	4	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:38.790789	20 mg	manidipine	1	Tablet	1.0	2026072213:57:38	2026072213:57:38	8-12-16-20	4 times per day	Morning-noon-evening-night	953459066831	4
219	68	MOCKPOS-15-1784703458565-9398	324102210135933701	1500 mg	4	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:38.790789	1500 mg	caltab	1	Tablet	1.0	2026072213:57:38	2026072213:57:38	8-12-16-20	4 times per day	Morning-noon-evening-night	704394170407	4
220	69	MOCKPOS-16-1784703459641-9105	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:39.856247	20 mg	manidipine	1	Tablet	1.0	2026072213:57:39	2026072213:57:39	8-20	2 times per day	Morning-night	830081173789	4
221	69	MOCKPOS-16-1784703459641-9105	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:39.856247	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:39	2026072213:57:39	8-20	2 times per day	Morning-night	222653266821	4
222	70	MOCKPOS-17-1784703460523-5984	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-22 06:57:40.720758	0.5 mg	lorazepam	1	Tablet	1.0	2026072213:57:40	2026072213:57:40	8-20	2 times per day	Morning-night	892162686486	4
223	70	MOCKPOS-17-1784703460523-5984	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:40.720758	1500 mg	caltab	1	Tablet	1.0	2026072213:57:40	2026072213:57:40	8-20	2 times per day	Morning-night	343779520839	4
224	70	MOCKPOS-17-1784703460523-5984	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:40.720758	20 mg	manidipine	1	Tablet	1.0	2026072213:57:40	2026072213:57:40	8-20	2 times per day	Morning-night	411786927637	4
225	71	MOCKPOS-18-1784703461565-4312	323031511325067001	20 mg	3	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:41.79097	20 mg	manidipine	1	Tablet	1.0	2026072213:57:41	2026072213:57:41	08:00-14:00-20:00	3 times per day	Morning-noon-night	316034400736	4
226	71	MOCKPOS-18-1784703461565-4312	324102210135933701	1500 mg	3	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:41.79097	1500 mg	caltab	1	Tablet	1.0	2026072213:57:41	2026072213:57:41	08:00-14:00-20:00	3 times per day	Morning-noon-night	839433570752	4
227	72	MOCKPOS-19-1784703462469-8979	323031511325067001	20 mg	1	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-22 06:57:42.681364	20 mg	manidipine	1	Tablet	1.0	2026072213:57:42	2026072213:57:42	20:00	Once per day	Night	664069488654	4
228	72	MOCKPOS-19-1784703462469-8979	324102210135933701	1500 mg	1	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:42.681364	1500 mg	caltab	1	Tablet	1.0	2026072213:57:42	2026072213:57:42	20:00	Once per day	Night	357459264717	4
229	73	MOCKPOS-20-1784703463318-5004	324102210135933701	1500 mg	1	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-22 06:57:43.521047	1500 mg	caltab	1	Tablet	1.0	2026072213:57:43	2026072213:57:43	20:00	Once per day	Night	270357590981	4
230	74	MOCKTC-CB-RFID-01-1784745345794-2174	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-22 18:35:46.962753	30 mg/mL	ephe	1	Tablet	1.0	2026072301:35:45	2026072301:35:45	08:00	Once per day	Morning	485865848334	3
231	75	MOCKTC-CB-RFID-02-1784745347136-9962	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-22 18:35:47.502515	500 mg/10 mL	suxa	1	Tablet	1.0	2026072301:35:47	2026072301:35:47	08:00	Once per day	Morning	943418922115	3
232	76	MOCKTC-CB-RFID-03-1784745347569-8375	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-22 18:35:47.965658	325 mg	aspi	1	Tablet	1.0	2026072301:35:47	2026072301:35:47	08:00	Once per day	Morning	211101854003	3
233	77	MOCKTC-CB-RFID-04-1784745348066-3103	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-22 18:35:48.422659	0.6 mg/mL	atro	1	Tablet	1.0	2026072301:35:48	2026072301:35:48	08:00	Once per day	Morning	375431445573	3
234	78	MOCKTC-CB-RFID-05-1784745348526-9873	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-22 18:35:48.890604	30 mg/mL	ephe	1	Tablet	1.0	2026072301:35:48	2026072301:35:48	08:00	Once per day	Morning	967378479349	3
235	78	MOCKTC-CB-RFID-05-1784745348526-9873	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-22 18:35:48.890604	500 mg/10 mL	suxa	1	Tablet	1.0	2026072301:35:48	2026072301:35:48	08:00	Once per day	Morning	808137566547	3
236	79	MOCKTC-CB-RFID-06-1784745349114-4672	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-22 18:35:49.493594	30 mg/mL	ephe	1	Tablet	1.0	2026072301:35:49	2026072301:35:49	08:00	Once per day	Morning	731015540655	3
237	79	MOCKTC-CB-RFID-06-1784745349114-4672	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-22 18:35:49.493594	325 mg	aspi	1	Tablet	1.0	2026072301:35:49	2026072301:35:49	08:00	Once per day	Morning	357595388971	3
238	80	MOCKTC-CB-RFID-07-1784745349716-5642	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-22 18:35:50.090612	30 mg/mL	ephe	1	Tablet	1.0	2026072301:35:49	2026072301:35:49	08:00	Once per day	Morning	728502508347	3
239	80	MOCKTC-CB-RFID-07-1784745349716-5642	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-22 18:35:50.090612	0.6 mg/mL	atro	1	Tablet	1.0	2026072301:35:49	2026072301:35:49	08:00	Once per day	Morning	333873824510	3
240	81	MOCKTC-CB-RFID-08-1784745350305-3389	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-22 18:35:50.662615	500 mg/10 mL	suxa	1	Tablet	1.0	2026072301:35:50	2026072301:35:50	08:00	Once per day	Morning	912660651107	3
241	81	MOCKTC-CB-RFID-08-1784745350305-3389	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-22 18:35:50.662615	325 mg	aspi	1	Tablet	1.0	2026072301:35:50	2026072301:35:50	08:00	Once per day	Morning	212827632335	3
242	82	MOCKTC-CB-RFID-09-1784745350865-1874	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-22 18:35:51.23087	500 mg/10 mL	suxa	1	Tablet	1.0	2026072301:35:50	2026072301:35:50	08:00	Once per day	Morning	850087467702	3
243	82	MOCKTC-CB-RFID-09-1784745350865-1874	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-22 18:35:51.23087	0.6 mg/mL	atro	1	Tablet	1.0	2026072301:35:50	2026072301:35:50	08:00	Once per day	Morning	442872507338	3
244	83	MOCKTC-CB-RFID-10-1784745351427-1735	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-22 18:35:51.782599	325 mg	aspi	1	Tablet	1.0	2026072301:35:51	2026072301:35:51	08:00	Once per day	Morning	268079283122	3
245	83	MOCKTC-CB-RFID-10-1784745351427-1735	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-22 18:35:51.782599	0.6 mg/mL	atro	1	Tablet	1.0	2026072301:35:51	2026072301:35:51	08:00	Once per day	Morning	866223260654	3
246	84	MOCKTC-CB-RFID-11-1784745352001-8798	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-22 18:35:52.365639	30 mg/mL	ephe	1	Tablet	1.0	2026072301:35:52	2026072301:35:52	08:00	Once per day	Morning	499925722904	3
247	84	MOCKTC-CB-RFID-11-1784745352001-8798	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-22 18:35:52.365639	500 mg/10 mL	suxa	1	Tablet	1.0	2026072301:35:52	2026072301:35:52	08:00	Once per day	Morning	787407643830	3
248	84	MOCKTC-CB-RFID-11-1784745352001-8798	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-22 18:35:52.365639	325 mg	aspi	1	Tablet	1.0	2026072301:35:52	2026072301:35:52	08:00	Once per day	Morning	316747117737	3
249	85	MOCKTC-CB-RFID-12-1784745352675-5916	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-22 18:35:53.042478	30 mg/mL	ephe	1	Tablet	1.0	2026072301:35:52	2026072301:35:52	08:00	Once per day	Morning	952893577933	3
250	85	MOCKTC-CB-RFID-12-1784745352675-5916	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-22 18:35:53.042478	500 mg/10 mL	suxa	1	Tablet	1.0	2026072301:35:52	2026072301:35:52	08:00	Once per day	Morning	626446260642	3
251	85	MOCKTC-CB-RFID-12-1784745352675-5916	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-22 18:35:53.042478	0.6 mg/mL	atro	1	Tablet	1.0	2026072301:35:52	2026072301:35:52	08:00	Once per day	Morning	957849039711	3
252	86	MOCKTC-CB-RFID-13-1784745353386-3330	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-22 18:35:53.742407	30 mg/mL	ephe	1	Tablet	1.0	2026072301:35:53	2026072301:35:53	08:00	Once per day	Morning	243188917727	3
253	86	MOCKTC-CB-RFID-13-1784745353386-3330	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-22 18:35:53.742407	325 mg	aspi	1	Tablet	1.0	2026072301:35:53	2026072301:35:53	08:00	Once per day	Morning	650788112789	3
254	86	MOCKTC-CB-RFID-13-1784745353386-3330	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-22 18:35:53.742407	0.6 mg/mL	atro	1	Tablet	1.0	2026072301:35:53	2026072301:35:53	08:00	Once per day	Morning	284405893253	3
255	87	MOCKTC-CB-RFID-14-1784745354027-8372	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-22 18:35:54.382675	500 mg/10 mL	suxa	1	Tablet	1.0	2026072301:35:54	2026072301:35:54	08:00	Once per day	Morning	409970071521	3
256	87	MOCKTC-CB-RFID-14-1784745354027-8372	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-22 18:35:54.382675	325 mg	aspi	1	Tablet	1.0	2026072301:35:54	2026072301:35:54	08:00	Once per day	Morning	103852807975	3
257	87	MOCKTC-CB-RFID-14-1784745354027-8372	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-22 18:35:54.382675	0.6 mg/mL	atro	1	Tablet	1.0	2026072301:35:54	2026072301:35:54	08:00	Once per day	Morning	486429951881	3
258	88	MOCKTC-CB-RFID-15-1784745354685-4821	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-22 18:35:55.042449	30 mg/mL	ephe	1	Tablet	1.0	2026072301:35:54	2026072301:35:54	08:00	Once per day	Morning	254185241117	3
259	88	MOCKTC-CB-RFID-15-1784745354685-4821	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-22 18:35:55.042449	500 mg/10 mL	suxa	1	Tablet	1.0	2026072301:35:54	2026072301:35:54	08:00	Once per day	Morning	533265237424	3
260	88	MOCKTC-CB-RFID-15-1784745354685-4821	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-22 18:35:55.042449	325 mg	aspi	1	Tablet	1.0	2026072301:35:54	2026072301:35:54	08:00	Once per day	Morning	512072185627	3
261	88	MOCKTC-CB-RFID-15-1784745354685-4821	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-22 18:35:55.042449	0.6 mg/mL	atro	1	Tablet	1.0	2026072301:35:54	2026072301:35:54	08:00	Once per day	Morning	844542047949	3
277	94	MOCKPOS-26-1784790546430-6605	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-23 07:09:06.619001	20 mg	manidipine	1	Tablet	1.0	2026072314:09:06	2026072314:09:06	8-20	2 times per day	Morning-night	638387587576	4
278	94	MOCKPOS-26-1784790546430-6605	324102210135933701	1500 mg	4	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-23 07:09:06.619001	1500 mg	caltab	1	Tablet	1.0	2026072314:09:06	2026072314:09:06	8-12-16-20	4 times per day	Morning-noon-evening-night	455219818712	4
279	94	MOCKPOS-26-1784790546430-6605	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-23 07:09:06.619001	0.5 mg	lorazepam	1	Tablet	1.0	2026072314:09:06	2026072314:09:06	20:00	Once per day	night	902009550559	4
280	94	MOCKPOS-26-1784790546430-6605	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-23 07:09:06.619001	325 mg	aspirin	1	Tablet	1.0	2026072314:09:06	2026072314:09:06	08:00	Once per day	Morning	180867191783	4
281	94	MOCKPOS-26-1784790546430-6605	1309075164	500mg	3	0.00	As prescribed	\N	Greater Pharma	เมทฟอร์มิน	2026-07-23 07:09:06.619001	500mg	metformin	1	Tablet	1.0	2026072314:09:06	2026072314:09:06	8-12-20	3 times per day	Morning-noon-night	881426038427	4
274	93	MOCKPOS-25-1784790545778-7727	1309075166	1 tab	2	0.00	As prescribed	\N	Pharmasant	วิตามินบีรวม	2026-07-23 07:09:05.971941	1 tab	multivitamin	1	Tablet	1.0	2026072314:09:05	2026072314:09:05	8-20	2 times per day	Morning-night	412573250413	4
275	93	MOCKPOS-25-1784790545778-7727	1309075174	10mg	2	0.00	As prescribed	\N	Biolab	ลอราทาดีน	2026-07-23 07:09:05.971941	10mg	loratadine	1	Tablet	1.0	2026072314:09:05	2026072314:09:05	8-20	2 times per day	Morning-night	920028366013	4
276	93	MOCKPOS-25-1784790545778-7727	316011510250542801	50 mg	1	0.00	As prescribed	\N	CENTRAL POLY TRADING CO., LTD.	TRAMAdol  50 mg TAB_ค	2026-07-23 07:09:05.971941	50 mg	tramadol	1	Tablet	1.0	2026072314:09:05	2026072314:09:05	12:00	Once per day	noon	658525524316	4
268	91	MOCKPOS-23-1784790544478-7979	323031511325067001	20 mg	4	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-23 07:09:04.671815	20 mg	manidipine	1	Tablet	1.0	2026072314:09:04	2026072314:09:04	8-12-16-20	4 times per day	Morning-noon-evening-night	861954747671	4
269	91	MOCKPOS-23-1784790544478-7979	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-23 07:09:04.671815	1500 mg	caltab	1	Tablet	1.0	2026072314:09:04	2026072314:09:04	8-20	2 times per day	Morning-night	806076224464	4
270	91	MOCKPOS-23-1784790544478-7979	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-23 07:09:04.671815	0.5 mg	lorazepam	1	Tablet	1.0	2026072314:09:04	2026072314:09:04	20:00	Once per day	night	772412780397	4
271	91	MOCKPOS-23-1784790544478-7979	114051414152771401	325 mg	3	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-23 07:09:04.671815	325 mg	aspirin	1	Tablet	1.0	2026072314:09:04	2026072314:09:04	8-12-20	3 times per day	Morning-noon-night	421896334258	4
265	90	MOCKPOS-22-1784790543825-2545	1309075166	1 tab	1	0.00	As prescribed	\N	Pharmasant	วิตามินบีรวม	2026-07-23 07:09:04.021007	1 tab	multivitamin	1	Tablet	1.0	2026072314:09:03	2026072314:09:03	08:00	Once per day	Morning	373190795649	4
266	90	MOCKPOS-22-1784790543825-2545	1309075174	10mg	2	0.00	As prescribed	\N	Biolab	ลอราทาดีน	2026-07-23 07:09:04.021007	10mg	loratadine	1	Tablet	1.0	2026072314:09:03	2026072314:09:03	08:00-20:00	2 times per day	Morning-night	701623669774	4
267	90	MOCKPOS-22-1784790543825-2545	316011510250542801	50 mg	3	0.00	As prescribed	\N	CENTRAL POLY TRADING CO., LTD.	TRAMAdol  50 mg TAB_ค	2026-07-23 07:09:04.021007	50 mg	tramadol	1	Tablet	1.0	2026072314:09:03	2026072314:09:03	08:00-14:00-20:00	3 times per day	Morning-noon-night	952619204488	4
262	89	MOCKPOS-21-1784790542257-4919	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-23 07:09:03.342085	20 mg	manidipine	1	Tablet	1.0	2026072314:09:02	2026072314:09:02	8-20	2 times per day	Morning-night	749067190607	4
263	89	MOCKPOS-21-1784790542257-4919	1616_1	0.5 mg	3	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-23 07:09:03.342085	0.5 mg	lorazepam	1	Tablet	1.0	2026072314:09:02	2026072314:09:02	8-12-20	3 times per day	Morning-noon-night	534973870293	4
264	89	MOCKPOS-21-1784790542257-4919	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-23 07:09:03.342085	1500 mg	caltab	1	Tablet	1.0	2026072314:09:02	2026072314:09:02	8-20	2 times per day	Morning-night	357927108708	4
272	92	MOCKPOS-24-1784790545247-1934	1309075164	500mg	2	0.00	As prescribed	\N	Greater Pharma	เมทฟอร์มิน	2026-07-23 07:09:05.434963	500mg	metformin	1	Tablet	1.0	2026072314:09:05	2026072314:09:05	8-12	2 times per day	Morning-noon	876408835772	4
273	92	MOCKPOS-24-1784790545247-1934	1309075165	10mg	2	0.00	As prescribed	\N	Biolab	ซิมวาสแตติน	2026-07-23 07:09:05.434963	10mg	simvastatin	1	Tablet	1.0	2026072314:09:05	2026072314:09:05	12-20	2 times per day	noon-night	833597239234	4
282	95	MOCKPOS-27-1784792262833-3537	323031511325067001	20 mg	3	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-23 07:37:43.808589	20 mg	manidipine	1	Tablet	1.0	2026072314:37:42	2026072314:37:42	8-12-20	3 times per day	Morning-noon-night	715042669122	4
283	95	MOCKPOS-27-1784792262833-3537	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-23 07:37:43.808589	0.5 mg	lorazepam	1	Tablet	1.0	2026072314:37:42	2026072314:37:42	8-20	2 times per day	Morning-night	560875658145	4
284	95	MOCKPOS-27-1784792262833-3537	324102210135933701	1500 mg	1	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-23 07:37:43.808589	1500 mg	caltab	1	Tablet	1.0	2026072314:37:42	2026072314:37:42	20:00	Once per day	night	660855880652	4
285	96	MOCKPOS-28-1784792264285-6829	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-23 07:37:44.497662	20 mg	manidipine	1	Tablet	1.0	2026072314:37:44	2026072314:37:44	8-16	2 times per day	Morning-evening	187705597651	4
286	96	MOCKPOS-28-1784792264285-6829	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-23 07:37:44.497662	0.5 mg	lorazepam	1	Tablet	1.0	2026072314:37:44	2026072314:37:44	12-20	2 times per day	noon-night	886457512808	4
287	96	MOCKPOS-28-1784792264285-6829	324102210135933701	1500 mg	4	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-23 07:37:44.497662	1500 mg	caltab	1	Tablet	1.0	2026072314:37:44	2026072314:37:44	8-12-16-20	4 times per day	Morning-noon-evening-night	137696066402	4
288	97	MOCKPOS-29-1784792264937-7075	323031511325067001	20 mg	1	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-23 07:37:45.146894	20 mg	manidipine	1	Tablet	1.0	2026072314:37:44	2026072314:37:44	08:00	Once per day	Morning	745660401573	4
289	97	MOCKPOS-29-1784792264937-7075	1616_1	0.5 mg	1	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-23 07:37:45.146894	0.5 mg	lorazepam	1	Tablet	1.0	2026072314:37:44	2026072314:37:44	08:00	Once per day	Morning	749918386498	4
290	97	MOCKPOS-29-1784792264937-7075	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-23 07:37:45.146894	1500 mg	caltab	1	Tablet	1.0	2026072314:37:44	2026072314:37:44	08:00-20:00	2 times per day	Morning-night	820769188853	4
291	98	MOCKPOS-30-1784792265570-2406	323031511325067001	20 mg	2	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-23 07:37:45.781571	20 mg	manidipine	1	Tablet	1.0	2026072314:37:45	2026072314:37:45	12-20	2 times per day	noon-night	864312444199	4
292	98	MOCKPOS-30-1784792265570-2406	1616_1	0.5 mg	2	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-23 07:37:45.781571	0.5 mg	lorazepam	1	Tablet	1.0	2026072314:37:45	2026072314:37:45	8-12	2 times per day	Morning-noon	719218140120	4
293	98	MOCKPOS-30-1784792265570-2406	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-23 07:37:45.781571	1500 mg	caltab	1	Tablet	1.0	2026072314:37:45	2026072314:37:45	8-20	2 times per day	Morning-night	838354606427	4
294	99	MOCKPOS-31-1784792266207-4184	323031511325067001	20 mg	4	0.00	As prescribed	\N	BERLIN	Manidipine 20 mg tab_(berlin)_ข	2026-07-23 07:37:46.417734	20 mg	manidipine	1	Tablet	1.0	2026072314:37:46	2026072314:37:46	8-12-16-20	4 times per day	Morning-noon-evening-night	171237830573	4
295	99	MOCKPOS-31-1784792266207-4184	1616_1	0.5 mg	4	0.00	As prescribed	\N	POLIPHARM	Lorazepam_0.5 mg แผงขาว tab_ก (Ativan)	2026-07-23 07:37:46.417734	0.5 mg	lorazepam	1	Tablet	1.0	2026072314:37:46	2026072314:37:46	8-12-16-20	4 times per day	Morning-noon-evening-night	370344514992	4
296	99	MOCKPOS-31-1784792266207-4184	324102210135933701	1500 mg	2	0.00	As prescribed	\N	บริษัท พรอส ฟาร์มา จำกัด	Calcium carbonate_1,500 mg_(CALTAB) tab_(prosp)_ก	2026-07-23 07:37:46.417734	1500 mg	caltab	1	Tablet	1.0	2026072314:37:46	2026072314:37:46	8-20	2 times per day	Morning-night	578522268987	4
297	100	MOCKTC-CB-CONC-05-1784853551678-5495	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-24 00:39:12.055901	500 mg/10 mL	suxa	1	Tablet	1.0	2026072407:39:11	2026072407:39:11	08:00	Once per day	Morning	707853616195	3
298	100	MOCKTC-CB-CONC-05-1784853551678-5495	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-24 00:39:12.055901	30 mg/mL	ephe	1	Tablet	1.0	2026072407:39:11	2026072407:39:11	08:00	Once per day	Morning	292688711298	3
299	100	MOCKTC-CB-CONC-05-1784853551678-5495	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-24 00:39:12.055901	325 mg	aspi	1	Tablet	1.0	2026072407:39:11	2026072407:39:11	08:00	Once per day	Morning	356705515673	3
300	100	MOCKTC-CB-CONC-05-1784853551678-5495	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-24 00:39:12.055901	0.6 mg/mL	atro	1	Tablet	1.0	2026072407:39:11	2026072407:39:11	08:00	Once per day	Morning	959714244553	3
301	101	MOCKTC-CB-CONC-06-1784853552808-1038	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-24 00:39:13.088167	500 mg/10 mL	suxa	1	Tablet	1.0	2026072407:39:12	2026072407:39:12	08:00	Once per day	Morning	791986309565	3
302	101	MOCKTC-CB-CONC-06-1784853552808-1038	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-24 00:39:13.088167	30 mg/mL	ephe	1	Tablet	1.0	2026072407:39:12	2026072407:39:12	08:00	Once per day	Morning	473616518729	3
303	101	MOCKTC-CB-CONC-06-1784853552808-1038	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-24 00:39:13.088167	325 mg	aspi	1	Tablet	1.0	2026072407:39:12	2026072407:39:12	08:00	Once per day	Morning	970059825910	3
304	101	MOCKTC-CB-CONC-06-1784853552808-1038	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-24 00:39:13.088167	0.6 mg/mL	atro	1	Tablet	1.0	2026072407:39:12	2026072407:39:12	08:00	Once per day	Morning	897275096167	3
305	102	MOCKTC-CB-CONC-07-1784853553798-9017	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-24 00:39:14.084847	500 mg/10 mL	suxa	1	Tablet	1.0	2026072407:39:13	2026072407:39:13	08:00	Once per day	Morning	742131337303	3
306	102	MOCKTC-CB-CONC-07-1784853553798-9017	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-24 00:39:14.084847	30 mg/mL	ephe	1	Tablet	1.0	2026072407:39:13	2026072407:39:13	08:00	Once per day	Morning	138956262456	3
307	102	MOCKTC-CB-CONC-07-1784853553798-9017	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-24 00:39:14.084847	325 mg	aspi	1	Tablet	1.0	2026072407:39:13	2026072407:39:13	08:00	Once per day	Morning	450132653830	3
308	102	MOCKTC-CB-CONC-07-1784853553798-9017	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-24 00:39:14.084847	0.6 mg/mL	atro	1	Tablet	1.0	2026072407:39:13	2026072407:39:13	08:00	Once per day	Morning	782711422456	3
309	103	MOCKTC-CB-CONC-08-1784853554613-4429	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-24 00:39:14.892971	500 mg/10 mL	suxa	1	Tablet	1.0	2026072407:39:14	2026072407:39:14	08:00	Once per day	Morning	672075787271	3
310	103	MOCKTC-CB-CONC-08-1784853554613-4429	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-24 00:39:14.892971	30 mg/mL	ephe	1	Tablet	1.0	2026072407:39:14	2026072407:39:14	08:00	Once per day	Morning	445019772851	3
311	103	MOCKTC-CB-CONC-08-1784853554613-4429	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-24 00:39:14.892971	325 mg	aspi	1	Tablet	1.0	2026072407:39:14	2026072407:39:14	08:00	Once per day	Morning	421880810880	3
312	103	MOCKTC-CB-CONC-08-1784853554613-4429	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-24 00:39:14.892971	0.6 mg/mL	atro	1	Tablet	1.0	2026072407:39:14	2026072407:39:14	08:00	Once per day	Morning	990115069296	3
313	104	MOCKTC-CB-CONC-09-1784853555572-9327	113121709105974801	500 mg/10 mL	1	0.00	As prescribed	\N	PINYO PHARMACY	SuxamethoniumCl500mg/10ml INJ_ค(pinyo)_(R*)	2026-07-24 00:39:15.877178	500 mg/10 mL	suxa	1	Tablet	1.0	2026072407:39:15	2026072407:39:15	08:00	Once per day	Morning	440615681276	3
314	104	MOCKTC-CB-CONC-09-1784853555572-9327	1388_1	30 mg/mL	1	0.00	As prescribed	\N	กองควบคุมวัตถุเสพติดฯ	Ephedrine 30 mg/ml _inj(1ml)_ค	2026-07-24 00:39:15.877178	30 mg/mL	ephe	1	Tablet	1.0	2026072407:39:15	2026072407:39:15	08:00	Once per day	Morning	578432849523	3
315	104	MOCKTC-CB-CONC-09-1784853555572-9327	114051414152771401	325 mg	1	0.00	As prescribed	\N	DIETHELM Keller (British Dispensary)	Aspirin 325mg tab_ก(อังกฤษตรางู)	2026-07-24 00:39:15.877178	325 mg	aspi	1	Tablet	1.0	2026072407:39:15	2026072407:39:15	08:00	Once per day	Morning	142016684788	3
316	104	MOCKTC-CB-CONC-09-1784853555572-9327	911_1	0.6 mg/mL	1	0.00	As prescribed	\N	องค์การเภสัชกรรม	Atropine 0.6 mg/mlinj.(1ml.)_ก	2026-07-24 00:39:15.877178	0.6 mg/mL	atro	1	Tablet	1.0	2026072407:39:15	2026072407:39:15	08:00	Once per day	Morning	570694317960	3
\.


--
-- Data for Name: prescription_header; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.prescription_header (id, mzno, patientname, patientage, patientsex, prescriptionhisid, prescriptiondoctorname, prescriptionhint, departmentname, fetchwindow, basket_id, pre_state, delete_flag, finish_time, notified_state, created_at, updated_at, pre_type, patientbirthday, patientvisitid, patientbed, doctorid, administration, repeatindicator, deptcode) FROM stdin;
32	4919433	สมหญิง วงศ์สว่าง TC-M-20	62	0	MOCK1784698585792	พญ.สุนีย์ ใจบุญ	Combined DB usage code + custom time (NZP360 only)	อายุรกรรม	2	\N	-1	0	\N	0	2026-07-22 05:36:27.132105	2026-07-22 05:36:27.132105	0	19640215	201704	B07	D2201	Oral	1	701
53	3586450	วิภา เจริญสุข TC-M-23	58	1	MOCKTC-M-23-1784701266342	นพ.ประเสริฐ ตั้งมั่น	Complex + Dosage: overlapping times combined with differing tablet counts per drug	อายุรกรรม	3	\N	-1	0	\N	0	2026-07-22 06:21:07.787605	2026-07-22 06:21:07.787605	0	19680512	281115	B12	D3301	Oral	1	701
56	1505544	ประยุทธ์ วงศ์สว่าง POS-03	69	0	MOCKPOS-03-1784703447488-3855	นพ.วิชัย รักษาดี	Positive/happy-path batch — 2 drug(s), 3 times per day	อายุรกรรม	2	\N	-1	0	\N	0	2026-07-22 06:57:27.711017	2026-07-22 06:57:27.711017	0	19990402	547638	B6	D6679	Oral	1	701
57	2918232	ปิติ บุญมาก POS-04	23	0	MOCKPOS-04-1784703448393-8428	พญ.สุนีย์ ใจบุญ	Positive/happy-path batch — 3 drug(s), Once per day	สูตินรีเวชกรรม	4	\N	-1	0	\N	0	2026-07-22 06:57:28.600594	2026-07-22 06:57:28.600594	0	19500413	157841	B14	D4853	Oral	1	703
58	6889930	กัลยา วงศ์สว่าง POS-05	54	1	MOCKPOS-05-1784703449439-6995	นพ.วิชัย รักษาดี	Positive/happy-path batch — 3 drug(s), 2 times per day	กุมารเวชกรรม	4	\N	-1	0	\N	0	2026-07-22 06:57:29.641809	2026-07-22 06:57:29.641809	0	19570523	832110	B10	D9498	Oral	1	702
59	4268749	อรทัย พูลสวัสดิ์ POS-06	81	1	MOCKPOS-06-1784703450513-1180	พญ.สุนีย์ ใจบุญ	Positive/happy-path batch — 2 drug(s), 2 times per day	อายุรกรรม	1	\N	-1	0	\N	0	2026-07-22 06:57:30.721623	2026-07-22 06:57:30.721623	0	19830517	716438	B10	D4367	Oral	1	701
60	2409862	สมหญิง แสงทอง POS-07	32	0	MOCKPOS-07-1784703451352-5847	พญ.สุนีย์ ใจบุญ	Positive/happy-path batch — 3 drug(s), 2 times per day	กุมารเวชกรรม	5	\N	-1	0	\N	0	2026-07-22 06:57:31.550698	2026-07-22 06:57:31.550698	0	19630622	626716	B14	D7572	Oral	1	702
61	7210135	วิภา รักษาดี POS-08	50	1	MOCKPOS-08-1784703452349-5043	นพ.ประเสริฐ ตั้งมั่น	Positive/happy-path batch — 1 drug(s), 4 times per day	สูตินรีเวชกรรม	5	\N	-1	0	\N	0	2026-07-22 06:57:32.561528	2026-07-22 06:57:32.561528	0	19850606	490670	B4	D8753	Oral	1	703
101	8475477	ลำดับที่ 2/5 TC-CB-CONC-06	33	1	MOCKTC-CB-CONC-06-1784853552808-1038	พญ.สุนีย์ ใจบุญ	Consecutive full-loop test: basket 2 of 5, same fetch window (1) — all 4 machines (Manual+RB1500+NZP360+COBOT)	อายุรกรรม	1	BASKET-16	0	0	\N	0	2026-07-24 00:39:13.088167	2026-07-24 00:41:54.585873	0	19660117	538945	B25	D9613	Oral	1	701
63	4183242	วิชัย ใจดี POS-10	50	0	MOCKPOS-10-1784703453757-7108	พญ.สุนีย์ ใจบุญ	Positive/happy-path batch — 3 drug(s), Once per day	อายุรกรรม	3	\N	-1	0	\N	0	2026-07-22 06:57:33.960861	2026-07-22 06:57:33.960861	0	19990107	383997	B4	D5952	Oral	1	701
100	3656082	ลำดับที่ 1/5 TC-CB-CONC-05	67	0	MOCKTC-CB-CONC-05-1784853551678-5495	พญ.สุนีย์ ใจบุญ	Consecutive full-loop test: basket 1 of 5, same fetch window (1) — all 4 machines (Manual+RB1500+NZP360+COBOT)	อายุรกรรม	1	BASKET-17	0	0	\N	0	2026-07-24 00:39:12.055901	2026-07-24 00:41:56.848887	0	19730209	960947	B18	D4804	Oral	1	701
66	7948874	อรทัย ใจดี POS-13	70	0	MOCKPOS-13-1784703456715-6468	นพ.วิชัย รักษาดี	Positive/happy-path batch — 2 drug(s), 4 times per day	สูตินรีเวชกรรม	3	\N	-1	0	\N	0	2026-07-22 06:57:36.920652	2026-07-22 06:57:36.920652	0	19700121	517168	B12	D2556	Oral	1	703
67	3926805	กัลยา วงศ์สว่าง POS-14	59	0	MOCKPOS-14-1784703457515-7157	พญ.สุนีย์ ใจบุญ	Positive/happy-path batch — 3 drug(s), 2 times per day	ศัลยกรรม	5	\N	-1	0	\N	0	2026-07-22 06:57:37.7214	2026-07-22 06:57:37.7214	0	19430711	202544	B6	D5553	Oral	1	704
69	9119702	มาลี ศรีสุข POS-16	62	0	MOCKPOS-16-1784703459641-9105	พญ.รัตนา แสงจันทร์	Positive/happy-path batch — 2 drug(s), 2 times per day	กุมารเวชกรรม	3	\N	-1	0	\N	0	2026-07-22 06:57:39.856247	2026-07-22 06:57:39.856247	0	20020514	920322	B7	D3192	Oral	1	702
103	7418244	ลำดับที่ 4/5 TC-CB-CONC-08	51	1	MOCKTC-CB-CONC-08-1784853554613-4429	พญ.สุนีย์ ใจบุญ	Consecutive full-loop test: basket 4 of 5, same fetch window (1) — all 4 machines (Manual+RB1500+NZP360+COBOT)	อายุรกรรม	1	BASKET-18	0	0	\N	0	2026-07-24 00:39:14.892971	2026-07-24 00:42:09.168969	0	19881015	755278	B29	D6500	Oral	1	701
102	7556428	ลำดับที่ 3/5 TC-CB-CONC-07	50	1	MOCKTC-CB-CONC-07-1784853553798-9017	พญ.สุนีย์ ใจบุญ	Consecutive full-loop test: basket 3 of 5, same fetch window (1) — all 4 machines (Manual+RB1500+NZP360+COBOT)	อายุรกรรม	1	BASKET-19	0	0	\N	0	2026-07-24 00:39:14.084847	2026-07-24 00:42:10.905434	0	19610601	337744	B15	D1679	Oral	1	701
104	8525490	ลำดับที่ 5/5 TC-CB-CONC-09	73	0	MOCKTC-CB-CONC-09-1784853555572-9327	นพ.วิชัย รักษาดี	Consecutive full-loop test: basket 5 of 5, same fetch window (1) — all 4 machines (Manual+RB1500+NZP360+COBOT)	อายุรกรรม	1	BASKET-20	0	0	\N	0	2026-07-24 00:39:15.877178	2026-07-24 00:42:17.47362	0	19750301	661299	B18	D7377	Oral	1	701
31	6178774	กัลยา ยืนยง	53	1	MOCK1783677525216	พญ.รัตนา แสงจันทร์	Before bed	สูตินรีเวชกรรม	2	\N	-1	0	\N	0	2026-07-10 09:58:45.450951	2026-07-23 10:04:13.483276	0	19650616	783625	B24	D3085	Topical	1	703
22	1114212	อรทัย แสงทอง	77	1	MOCK1783677521978	พญ.สุนีย์ ใจบุญ	Before bed	อายุรกรรม	3	\N	-1	0	\N	0	2026-07-10 09:58:41.375755	2026-07-10 09:58:41.375755	0	19580606	754263	B10	D1650	Intravenous	1	701
23	6464256	สมชาย รักษาดี	18	0	MOCK1783677521125	นพ.วิชัย รักษาดี	After meal	ผิวหนัง	4	\N	-1	0	\N	0	2026-07-10 09:58:41.806995	2026-07-10 09:58:41.806995	0	20130601	347023	B29	D6751	Intravenous	1	706
25	6416228	ปิติ ศรีสุข	29	1	MOCK1783677522686	นพ.ประเสริฐ ตั้งมั่น	With plenty of water	ห้องฉุกเฉิน	2	\N	-1	0	\N	0	2026-07-10 09:58:42.821026	2026-07-10 09:58:42.821026	0	20150701	739824	B15	D5045	Topical	1	705
26	6866847	ธนากร ทองแท้	18	0	MOCK1783677523715	นพ.วิชัย รักษาดี	Before meal	ศัลยกรรม	1	\N	-1	0	\N	0	2026-07-10 09:58:43.217016	2026-07-16 07:38:20.402039	0	19590727	920911	B13	D2714	Oral	1	704
33	5034519	อรทัย ยืนยง TC-M-01	29	0	MOCKTC-M-01-1784699981186	นพ.วิชัย รักษาดี	Basic: 1 time (HH:MM)	อายุรกรรม	5	\N	-1	0	\N	0	2026-07-22 05:59:42.78677	2026-07-22 05:59:42.78677	0	19850518	299878	B24	D1649	Oral	1	701
34	3902102	ธนากร รักษาดี TC-M-02	35	1	MOCKTC-M-02-1784699981186	นพ.วิชัย รักษาดี	Basic: 2 times (HH-HH)	อายุรกรรม	5	\N	-1	0	\N	0	2026-07-22 05:59:43.506586	2026-07-22 05:59:43.506586	0	19560301	763362	B13	D6261	Oral	1	701
35	8972022	มาลี พูลสวัสดิ์ TC-M-03	75	1	MOCKTC-M-03-1784699981186	นพ.วิชัย รักษาดี	Basic: 3 times (HH:MM-HH:MM)	อายุรกรรม	6	\N	-1	0	\N	0	2026-07-22 05:59:44.18711	2026-07-22 05:59:44.18711	0	19431201	345906	B24	D7009	Oral	1	701
36	3587671	กัลยา พูลสวัสดิ์ TC-M-04	54	0	MOCKTC-M-04-1784699981186	พญ.สุนีย์ ใจบุญ	Basic: 4 times (qid pattern)	อายุรกรรม	6	\N	-1	0	\N	0	2026-07-22 05:59:45.256739	2026-07-22 05:59:45.256739	0	19940401	365171	B2	D7393	Oral	1	701
37	1412754	มาลี รักษาดี TC-M-05	21	1	MOCKTC-M-05-1784699981186	นพ.ประเสริฐ ตั้งมั่น	Combo: 2 drugs, same 1 time	อายุรกรรม	1	\N	-1	0	\N	0	2026-07-22 05:59:45.941924	2026-07-22 05:59:45.941924	0	19920916	269872	B7	D9988	Oral	1	701
38	7893476	สมหญิง รักษาดี TC-M-06	25	0	MOCKTC-M-06-1784699981186	นพ.ประเสริฐ ตั้งมั่น	Combo: 2 drugs, same 2 times	อายุรกรรม	4	\N	-1	0	\N	0	2026-07-22 05:59:46.806453	2026-07-22 05:59:46.806453	0	19511105	573573	B4	D6654	Oral	1	701
39	7968918	ธนากร ศรีสุข TC-M-07	39	0	MOCKTC-M-07-1784699981186	พญ.รัตนา แสงจันทร์	Combo: overlapping times	อายุรกรรม	3	\N	-1	0	\N	0	2026-07-22 05:59:47.657027	2026-07-22 05:59:47.657027	0	19540116	156366	B14	D4422	Oral	1	701
40	2209982	กัลยา พูลสวัสดิ์ TC-M-08	67	1	MOCKTC-M-08-1784699981186	นพ.วิชัย รักษาดี	Complex: 3 drugs, same 1 time (limit exactly 3/sachet)	อายุรกรรม	4	\N	-1	0	\N	0	2026-07-22 05:59:48.507312	2026-07-22 05:59:48.507312	0	19890803	353289	B7	D2781	Oral	1	701
41	1875364	ประยุทธ์ ทองแท้ TC-M-09	82	1	MOCKTC-M-09-1784699981186	นพ.ประเสริฐ ตั้งมั่น	Complex: 3 drugs, same 3 times	อายุรกรรม	6	\N	-1	0	\N	0	2026-07-22 05:59:49.536789	2026-07-22 05:59:49.536789	0	19720507	364090	B28	D1176	Oral	1	701
42	4326290	ประยุทธ์ รักษาดี TC-M-10	54	0	MOCKTC-M-10-1784699981186	นพ.ประเสริฐ ตั้งมั่น	Complex: fully overlapping times	อายุรกรรม	5	\N	-1	0	\N	0	2026-07-22 05:59:50.556707	2026-07-22 05:59:50.556707	0	19441216	851984	B9	D6000	Oral	1	701
43	1489896	ธนากร ศรีสุข TC-M-11	45	0	MOCKTC-M-11-1784699981186	นพ.วิชัย รักษาดี	Complex: mixed minute + whole-hour times	อายุรกรรม	1	\N	-1	0	\N	0	2026-07-22 05:59:51.526591	2026-07-22 05:59:51.526591	0	19960308	423067	B21	D8570	Oral	1	701
44	3193177	วิชัย รักษาดี TC-M-12	71	0	MOCKTC-M-12-1784699981186	พญ.สุนีย์ ใจบุญ	Edge: NULL time - fallback to PERFORM_TIME	อายุรกรรม	6	\N	-1	0	\N	0	2026-07-22 05:59:52.536734	2026-07-22 05:59:52.536734	0	19690323	608735	B5	D6331	Oral	1	701
45	7467638	กัลยา พูลสวัสดิ์ TC-M-13	40	0	MOCKTC-M-13-1784699981186	นพ.วิชัย รักษาดี	Edge: DB code 'qd' (once daily)	อายุรกรรม	3	\N	-1	0	\N	0	2026-07-22 05:59:53.21681	2026-07-22 05:59:53.21681	0	19520926	372668	B7	D4346	Oral	1	701
46	9806942	อรทัย ใจดี TC-M-14	26	1	MOCKTC-M-14-1784699981186	นพ.ประเสริฐ ตั้งมั่น	Edge: DB code 'qn' (bedtime/night)	อายุรกรรม	6	\N	-1	0	\N	0	2026-07-22 05:59:53.976803	2026-07-22 05:59:53.976803	0	19691116	382337	B11	D7240	Oral	1	701
47	6676812	มาลี ใจดี TC-M-15	82	1	MOCKTC-M-15-1784699981186	นพ.วิชัย รักษาดี	Edge: special DB code '3601200' (lunch)	อายุรกรรม	4	\N	-1	0	\N	0	2026-07-22 05:59:54.656707	2026-07-22 05:59:54.656707	0	20030821	174373	B15	D8813	Oral	1	701
48	1461285	ธนากร เจริญสุข TC-M-16	73	0	MOCKTC-M-16-1784699981186	นพ.วิชัย รักษาดี	3 drugs: 1 NULL/PRN, 2 with explicit times	อายุรกรรม	4	\N	-1	0	\N	0	2026-07-22 05:59:55.326532	2026-07-22 05:59:55.326532	0	19450904	579834	B17	D8387	Oral	1	701
49	3739570	สมหญิง แสงทอง TC-M-17	82	1	MOCKTC-M-17-1784699981186	พญ.รัตนา แสงจันทร์	Dosage Quantity: 2 drugs, same time, different tablet count	อายุรกรรม	5	\N	-1	0	\N	0	2026-07-22 05:59:56.367273	2026-07-22 05:59:56.367273	0	19910704	742353	B1	D1109	Oral	1	701
50	6525316	กัลยา วงศ์สว่าง TC-M-18	26	0	MOCKTC-M-18-1784699981186	นพ.ประเสริฐ ตั้งมั่น	Dosage Quantity: same drug, different dose at different times	อายุรกรรม	2	\N	-1	0	\N	0	2026-07-22 05:59:57.206597	2026-07-22 05:59:57.206597	0	19940622	445244	B1	D8827	Oral	1	701
51	8332071	ประยุทธ์ วงศ์สว่าง TC-M-21	72	1	MOCKTC-M-21-1784699981186	นพ.ประเสริฐ ตั้งมั่น	Multi-day / repeat schedule (3 days)	อายุรกรรม	2	\N	-1	0	\N	0	2026-07-22 05:59:58.066677	2026-07-22 05:59:58.066677	0	19841213	467401	B1	D1499	Oral	3	701
52	5808931	ประยุทธ์ วงศ์สว่าง TC-M-22	26	1	MOCKTC-M-22-1784699981186	นพ.วิชัย รักษาดี	Negative test: malformed/unsupported frequency string	อายุรกรรม	1	\N	-1	0	\N	0	2026-07-22 05:59:58.747865	2026-07-22 05:59:58.747865	0	19881120	625124	B8	D9857	Oral	1	701
54	3941508	สมชาย บุญมาก POS-01	39	0	MOCKPOS-01-1784703444253-7758	พญ.สุนีย์ ใจบุญ	Positive/happy-path batch — 3 drug(s), 3 times per day	สูตินรีเวชกรรม	2	\N	-1	0	\N	0	2026-07-22 06:57:25.560615	2026-07-22 06:57:25.560615	0	19850308	779439	B17	D1766	Oral	1	703
55	8818432	สมชาย แสงทอง POS-02	49	0	MOCKPOS-02-1784703446438-5425	นพ.วิชัย รักษาดี	Positive/happy-path batch — 3 drug(s), Once per day	อายุรกรรม	5	\N	-1	0	\N	0	2026-07-22 06:57:26.641163	2026-07-22 06:57:26.641163	0	19520517	609650	B17	D5417	Oral	1	701
78	5736880	อรทัย ใจดี TC-CB-RFID-05	25	1	MOCKTC-CB-RFID-05-1784745348526-9873	นพ.ประเสริฐ ตั้งมั่น	Conveyor routing: RB1500 + Manual	อายุรกรรม	6	BASKET-01	0	0	\N	0	2026-07-22 18:35:48.890604	2026-07-23 14:03:11.104925	0	19470123	974477	B6	D7696	Oral	1	701
77	4090067	มาลี ทองแท้ TC-CB-RFID-04	34	1	MOCKTC-CB-RFID-04-1784745348066-3103	นพ.ประเสริฐ ตั้งมั่น	Conveyor routing: COBOT only	อายุรกรรม	3	BASKET-02	0	0	\N	0	2026-07-22 18:35:48.422659	2026-07-23 14:03:12.47268	0	19950825	127024	B22	D8796	Oral	1	701
76	9373988	ธนากร บุญมาก TC-CB-RFID-03	37	1	MOCKTC-CB-RFID-03-1784745347569-8375	นพ.วิชัย รักษาดี	Conveyor routing: NZP360 only	อายุรกรรม	6	BASKET-03	0	0	\N	0	2026-07-22 18:35:47.965658	2026-07-23 14:03:17.393702	0	19680617	621527	B11	D2115	Oral	1	701
75	9289857	มาลี แสงทอง TC-CB-RFID-02	62	1	MOCKTC-CB-RFID-02-1784745347136-9962	พญ.รัตนา แสงจันทร์	Conveyor routing: Manual only	อายุรกรรม	3	BASKET-04	0	0	\N	0	2026-07-22 18:35:47.502515	2026-07-23 14:03:19.13353	0	19471005	172342	B24	D1396	Oral	1	701
74	4227756	ประยุทธ์ ศรีสุข TC-CB-RFID-01	32	0	MOCKTC-CB-RFID-01-1784745345794-2174	นพ.วิชัย รักษาดี	Conveyor routing: RB1500 only	อายุรกรรม	5	BASKET-05	0	0	\N	0	2026-07-22 18:35:46.962753	2026-07-23 14:03:20.37658	0	19831123	477381	B15	D5018	Oral	1	701
79	3851758	สมชาย ใจดี TC-CB-RFID-06	82	0	MOCKTC-CB-RFID-06-1784745349114-4672	พญ.รัตนา แสงจันทร์	Conveyor routing: RB1500 + NZP360	อายุรกรรม	2	BASKET-06	0	0	\N	0	2026-07-22 18:35:49.493594	2026-07-23 14:04:35.860876	0	19540202	614837	B11	D9496	Oral	1	701
81	1965371	อรทัย พูลสวัสดิ์ TC-CB-RFID-08	60	1	MOCKTC-CB-RFID-08-1784745350305-3389	พญ.สุนีย์ ใจบุญ	Conveyor routing: Manual + NZP360	อายุรกรรม	6	BASKET-07	0	0	\N	0	2026-07-22 18:35:50.662615	2026-07-23 14:04:48.432674	0	19840815	250516	B20	D1212	Oral	1	701
80	5628426	สมชาย บุญมาก TC-CB-RFID-07	49	1	MOCKTC-CB-RFID-07-1784745349716-5642	นพ.วิชัย รักษาดี	Conveyor routing: RB1500 + COBOT	อายุรกรรม	2	BASKET-08	0	0	\N	0	2026-07-22 18:35:50.090612	2026-07-23 14:04:49.583753	0	19730607	377723	B23	D9799	Oral	1	701
84	4981289	สมหญิง บุญมาก TC-CB-RFID-11	61	0	MOCKTC-CB-RFID-11-1784745352001-8798	พญ.สุนีย์ ใจบุญ	Conveyor routing: RB1500 + Manual + NZP360 (no COBOT)	อายุรกรรม	5	BASKET-09	0	0	\N	0	2026-07-22 18:35:52.365639	2026-07-23 14:05:00.580696	0	19620820	963213	B22	D2585	Oral	1	701
83	6566354	กัลยา ยืนยง TC-CB-RFID-10	65	0	MOCKTC-CB-RFID-10-1784745351427-1735	นพ.ประเสริฐ ตั้งมั่น	Conveyor routing: NZP360 + COBOT	อายุรกรรม	5	BASKET-10	0	0	\N	0	2026-07-22 18:35:51.782599	2026-07-23 14:05:02.463554	0	20030926	144301	B24	D6496	Oral	1	701
82	8410601	อรทัย แสงทอง TC-CB-RFID-09	55	1	MOCKTC-CB-RFID-09-1784745350865-1874	พญ.สุนีย์ ใจบุญ	Conveyor routing: Manual + COBOT	อายุรกรรม	1	BASKET-11	0	0	\N	0	2026-07-22 18:35:51.23087	2026-07-23 14:05:03.671305	0	19991106	759999	B28	D8349	Oral	1	701
86	2877427	ปิติ บุญมาก TC-CB-RFID-13	46	1	MOCKTC-CB-RFID-13-1784745353386-3330	พญ.สุนีย์ ใจบุญ	Conveyor routing: RB1500 + NZP360 + COBOT (no Manual)	อายุรกรรม	5	BASKET-12	0	0	\N	0	2026-07-22 18:35:53.742407	2026-07-23 14:05:29.903751	0	19610317	607957	B19	D9737	Oral	1	701
71	5995259	อรทัย พูลสวัสดิ์ POS-18	69	0	MOCKPOS-18-1784703461565-4312	พญ.สุนีย์ ใจบุญ	Positive/happy-path batch — 2 drug(s), 3 times per day	กุมารเวชกรรม	3	\N	-1	0	\N	0	2026-07-22 06:57:41.79097	2026-07-23 10:04:13.483276	0	19820423	107774	B29	D3930	Oral	1	702
85	3266323	วิภา ศรีสุข TC-CB-RFID-12	53	1	MOCKTC-CB-RFID-12-1784745352675-5916	พญ.รัตนา แสงจันทร์	Conveyor routing: RB1500 + Manual + COBOT (no NZP360)	อายุรกรรม	6	BASKET-13	0	0	\N	0	2026-07-22 18:35:53.042478	2026-07-23 14:05:31.048069	0	19860315	879166	B2	D7112	Oral	1	701
88	2816389	สมหญิง วงศ์สว่าง TC-CB-RFID-15	78	0	MOCKTC-CB-RFID-15-1784745354685-4821	นพ.ประเสริฐ ตั้งมั่น	Conveyor routing: Full loop — all 4 machines	อายุรกรรม	1	BASKET-14	0	0	\N	0	2026-07-22 18:35:55.042449	2026-07-23 14:05:39.414894	0	19550827	230597	B11	D9078	Oral	1	701
87	1891451	อรทัย ยืนยง TC-CB-RFID-14	36	0	MOCKTC-CB-RFID-14-1784745354027-8372	นพ.วิชัย รักษาดี	Conveyor routing: Manual + NZP360 + COBOT (no RB1500)	อายุรกรรม	3	BASKET-15	0	0	\N	0	2026-07-22 18:35:54.382675	2026-07-23 14:05:41.871798	0	19780214	543188	B21	D6514	Oral	1	701
94	3869781	ธนากร วงศ์สว่าง POS-26	40	1	MOCKPOS-26-1784790546430-6605	พญ.สุนีย์ ใจบุญ	Staggered per-drug frequency — 5 drugs, high sachet-count stress (four distinct clock times: 8/12/16/20)	อายุรกรรม	6	\N	-1	0	\N	0	2026-07-23 07:09:06.619001	2026-07-23 07:09:06.619001	0	19911228	745270	B27	D5031	Oral	1	701
24	2661019	วิชัย ยืนยง	30	1	MOCK1783677522648	นพ.วิชัย รักษาดี	With plenty of water	อายุรกรรม	5	\N	-1	0	\N	0	2026-07-10 09:58:42.31557	2026-07-23 10:04:13.483276	0	19540508	422450	B28	D4065	Intravenous	1	701
30	5353727	สมชาย ทองแท้	75	0	MOCK1783677524964	พญ.รัตนา แสงจันทร์	On empty stomach	ผิวหนัง	6	\N	-1	0	\N	0	2026-07-10 09:58:44.97786	2026-07-23 10:04:13.483276	0	19500414	467901	B1	D7068	Intravenous	1	706
62	5857242	อรทัย วงศ์สว่าง POS-09	42	1	MOCKPOS-09-1784703453044-4226	พญ.สุนีย์ ใจบุญ	Positive/happy-path batch — 1 drug(s), 4 times per day	สูตินรีเวชกรรม	3	\N	-1	0	\N	0	2026-07-22 06:57:33.270987	2026-07-23 10:04:13.483276	0	19500927	449994	B26	D1652	Oral	1	703
68	8085202	สมหญิง พูลสวัสดิ์ POS-15	21	1	MOCKPOS-15-1784703458565-9398	นพ.วิชัย รักษาดี	Positive/happy-path batch — 3 drug(s), 4 times per day	อายุรกรรม	3	\N	-1	0	\N	0	2026-07-22 06:57:38.790789	2026-07-23 10:04:13.483276	0	19991003	961828	B5	D9771	Oral	1	701
65	1838282	กัลยา ใจดี POS-12	47	0	MOCKPOS-12-1784703455669-3779	พญ.รัตนา แสงจันทร์	Positive/happy-path batch — 3 drug(s), 2 times per day	ศัลยกรรม	6	\N	-1	0	\N	0	2026-07-22 06:57:35.881343	2026-07-23 10:04:13.483276	0	19471017	530673	B16	D7488	Oral	1	704
64	5021519	วิภา ทองแท้ POS-11	79	0	MOCKPOS-11-1784703454803-2079	พญ.สุนีย์ ใจบุญ	Positive/happy-path batch — 2 drug(s), 3 times per day	ศัลยกรรม	2	\N	-1	0	\N	0	2026-07-22 06:57:35.001631	2026-07-23 10:04:13.483276	0	19781201	472449	B21	D5297	Oral	1	704
29	4927825	สมหญิง บุญมาก	22	0	MOCK1783677524810	นพ.วิชัย รักษาดี	With plenty of water	กุมารเวชกรรม	4	\N	-1	0	\N	0	2026-07-10 09:58:44.581396	2026-07-23 10:04:13.483276	0	19820817	588258	B20	D8662	Sublingual	1	702
28	1861437	ธนากร เจริญสุข	39	0	MOCK1783677523906	นพ.ประเสริฐ ตั้งมั่น	After meal	ศัลยกรรม	4	\N	-1	0	\N	0	2026-07-10 09:58:44.114063	2026-07-23 10:04:13.483276	0	20100115	848415	B26	D2750	Oral	1	704
27	7617528	วิภา รักษาดี	64	0	MOCK1783677523169	นพ.ประเสริฐ ตั้งมั่น	Before meal	ห้องฉุกเฉิน	1	\N	-1	0	\N	0	2026-07-10 09:58:43.647532	2026-07-23 10:04:13.483276	0	19760814	583451	B3	D1901	Sublingual	1	705
70	3776323	สมชาย ยืนยง POS-17	58	0	MOCKPOS-17-1784703460523-5984	นพ.วิชัย รักษาดี	Positive/happy-path batch — 3 drug(s), 2 times per day	สูตินรีเวชกรรม	1	\N	-1	0	\N	0	2026-07-22 06:57:40.720758	2026-07-23 10:04:13.483276	0	19770726	862023	B12	D8316	Oral	1	703
91	1286411	ปิติ ศรีสุข POS-23	60	0	MOCKPOS-23-1784790544478-7979	พญ.สุนีย์ ใจบุญ	Staggered per-drug frequency — 4 drugs, 4 distinct frequency shapes (max per-order variety)	อายุรกรรม	4	\N	-1	0	\N	0	2026-07-23 07:09:04.671815	2026-07-23 10:04:13.483276	0	19790706	737189	B14	D5794	Oral	1	701
93	6662475	ธนากร ศรีสุข POS-25	20	1	MOCKPOS-25-1784790545778-7727	พญ.รัตนา แสงจันทร์	Staggered per-drug frequency — two drugs share a 2x/day schedule, one drug is solo at noon only	กุมารเวชกรรม	4	\N	-1	0	\N	0	2026-07-23 07:09:05.971941	2026-07-23 10:04:13.483276	0	19720813	346416	B8	D2816	Oral	1	702
99	8396603	ช็อปเปอร์ กวางเรนเดียร์ POS-31	79	1	MOCKPOS-31-1784792266207-4184	นพ.ประเสริฐ ตั้งมั่น	Staggered per-drug frequency — two drugs share an identical 4x/day schedule, one drug is a 2x/day outlier	ศัลยกรรม	2	\N	-1	0	\N	0	2026-07-23 07:37:46.417734	2026-07-23 10:04:13.483276	0	19981228	155293	B25	D3168	Oral	1	704
98	6563540	ซันจิ ขาดำ POS-30	46	0	MOCKPOS-30-1784792265570-2406	พญ.สุนีย์ ใจบุญ	Staggered per-drug frequency — three different 2x/day pairs, each overlapping the next at exactly one time	อายุรกรรม	3	\N	-1	0	\N	0	2026-07-23 07:37:45.781571	2026-07-23 10:04:13.483276	0	19440301	653296	B15	D1040	Oral	1	701
73	4096394	สมชาย เจริญสุข POS-20	83	0	MOCKPOS-20-1784703463318-5004	นพ.วิชัย รักษาดี	Positive/happy-path batch — 1 drug(s), Once per day	สูตินรีเวชกรรม	1	\N	-1	0	\N	0	2026-07-22 06:57:43.521047	2026-07-23 10:04:13.483276	0	19450912	199711	B9	D3645	Oral	1	703
72	4020846	สมหญิง ใจดี POS-19	68	1	MOCKPOS-19-1784703462469-8979	นพ.ประเสริฐ ตั้งมั่น	Positive/happy-path batch — 2 drug(s), Once per day	อายุรกรรม	4	\N	-1	0	\N	0	2026-07-22 06:57:42.681364	2026-07-23 10:04:13.483276	0	19480824	565765	B16	D2869	Oral	1	701
90	4522663	สมหญิง พูลสวัสดิ์ POS-22	45	0	MOCKPOS-22-1784790543825-2545	พญ.สุนีย์ ใจบุญ	Staggered per-drug frequency — ascending dose count (1x, 2x, 3x/day) across 3 drugs	สูตินรีเวชกรรม	1	\N	-1	0	\N	0	2026-07-23 07:09:04.021007	2026-07-23 10:04:13.483276	0	19590610	236870	B13	D4544	Oral	1	703
89	2358881	อรทัย รักษาดี POS-21	49	1	MOCKPOS-21-1784790542257-4919	พญ.รัตนา แสงจันทร์	Staggered per-drug frequency — literal 2x/3x/2x mix (drug1 & drug3 share morning+night, drug2 adds a noon dose)	สูตินรีเวชกรรม	3	\N	-1	0	\N	0	2026-07-23 07:09:03.342085	2026-07-23 10:04:13.483276	0	19700606	560887	B8	D6138	Oral	1	703
92	6567575	อรทัย รักษาดี POS-24	72	1	MOCKPOS-24-1784790545247-1934	นพ.ประเสริฐ ตั้งมั่น	Staggered per-drug frequency — partial overlap at exactly one time (noon), 2 drugs	อายุรกรรม	1	\N	-1	0	\N	0	2026-07-23 07:09:05.434963	2026-07-23 10:04:13.483276	0	19441209	634506	B3	D1656	Oral	1	701
97	8176838	นามิ นักเดินเรือ POS-29	82	0	MOCKPOS-29-1784792264937-7075	นพ.ประเสริฐ ตั้งมั่น	Staggered per-drug frequency — two drugs share a solo morning dose, one drug also takes an evening dose	กุมารเวชกรรม	1	\N	-1	0	\N	0	2026-07-23 07:37:45.146894	2026-07-23 10:04:13.483276	0	19451118	332902	B18	D5542	Oral	1	702
96	6893751	โซโร นักดาบ POS-28	33	0	MOCKPOS-28-1784792264285-6829	นพ.วิชัย รักษาดี	Staggered per-drug frequency — two 2x/day drugs at different clock times plus one 4x/day drug covering both	สูตินรีเวชกรรม	5	\N	-1	0	\N	0	2026-07-23 07:37:44.497662	2026-07-23 10:04:13.483276	0	19981205	840799	B12	D8192	Oral	1	703
95	3064231	ลูฟี่ หมวกฟาง POS-27	52	1	MOCKPOS-27-1784792262833-3537	พญ.รัตนา แสงจันทร์	Staggered per-drug frequency — descending dose count (3x, 2x, 1x/day) across 3 drugs	กุมารเวชกรรม	5	\N	-1	0	\N	0	2026-07-23 07:37:43.808589	2026-07-23 10:04:13.483276	0	20050402	536332	B24	D9035	Oral	1	702
\.


--
-- Name: basket_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.basket_id_seq', 40, true);


--
-- Name: cobot_task_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cobot_task_id_seq', 1, false);


--
-- Name: department_dictionary_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.department_dictionary_id_seq', 8, true);


--
-- Name: machine_part_status_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.machine_part_status_id_seq', 1, false);


--
-- Name: machine_status_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.machine_status_id_seq', 1, false);


--
-- Name: medicine_dictionary_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.medicine_dictionary_id_seq', 54, true);


--
-- Name: prescription_detail_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.prescription_detail_id_seq', 316, true);


--
-- Name: prescription_header_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.prescription_header_id_seq', 104, true);


--
-- Name: basket basket_basket_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.basket
    ADD CONSTRAINT basket_basket_id_key UNIQUE (basket_id);


--
-- Name: basket basket_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.basket
    ADD CONSTRAINT basket_pkey PRIMARY KEY (id);


--
-- Name: cobot_task cobot_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobot_task
    ADD CONSTRAINT cobot_task_pkey PRIMARY KEY (id);


--
-- Name: cobot_task cobot_task_task_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobot_task
    ADD CONSTRAINT cobot_task_task_no_key UNIQUE (task_no);


--
-- Name: department_dictionary department_dictionary_dept_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_dictionary
    ADD CONSTRAINT department_dictionary_dept_code_key UNIQUE (dept_code);


--
-- Name: department_dictionary department_dictionary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_dictionary
    ADD CONSTRAINT department_dictionary_pkey PRIMARY KEY (id);


--
-- Name: machine_part_status machine_part_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machine_part_status
    ADD CONSTRAINT machine_part_status_pkey PRIMARY KEY (id);


--
-- Name: machine_status machine_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machine_status
    ADD CONSTRAINT machine_status_pkey PRIMARY KEY (id);


--
-- Name: medicine_dictionary medicine_dictionary_medicinehisid_medicineunit_medfactoryna_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine_dictionary
    ADD CONSTRAINT medicine_dictionary_medicinehisid_medicineunit_medfactoryna_key UNIQUE (medicinehisid, medicineunit, medfactoryname);


--
-- Name: medicine_dictionary medicine_dictionary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine_dictionary
    ADD CONSTRAINT medicine_dictionary_pkey PRIMARY KEY (id);


--
-- Name: prescription_detail prescription_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_detail
    ADD CONSTRAINT prescription_detail_pkey PRIMARY KEY (id);


--
-- Name: prescription_header prescription_header_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_header
    ADD CONSTRAINT prescription_header_pkey PRIMARY KEY (id);


--
-- Name: prescription_header prescription_header_prescriptionhisid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_header
    ADD CONSTRAINT prescription_header_prescriptionhisid_key UNIQUE (prescriptionhisid);


--
-- Name: idx_basket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_basket ON public.prescription_header USING btree (basket_id);


--
-- Name: idx_machine; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_machine ON public.machine_status USING btree (machine_id, "timestamp");


--
-- Name: idx_medhisid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medhisid ON public.prescription_detail USING btree (medhisid);


--
-- Name: idx_mzno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mzno ON public.prescription_header USING btree (mzno);


--
-- Name: idx_numcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_numcode ON public.medicine_dictionary USING btree (numcode);


--
-- Name: idx_pre_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pre_state ON public.prescription_header USING btree (pre_state);


--
-- Name: idx_prescriptionhisid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prescriptionhisid ON public.prescription_detail USING btree (prescriptionhisid);


--
-- Name: idx_pycode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pycode ON public.medicine_dictionary USING btree (pycode);


--
-- Name: basket basket_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.basket
    ADD CONSTRAINT basket_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescription_header(id) ON DELETE SET NULL;


--
-- Name: cobot_task cobot_task_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cobot_task
    ADD CONSTRAINT cobot_task_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescription_header(id);


--
-- Name: machine_part_status machine_part_status_machine_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machine_part_status
    ADD CONSTRAINT machine_part_status_machine_status_id_fkey FOREIGN KEY (machine_status_id) REFERENCES public.machine_status(id) ON DELETE CASCADE;


--
-- Name: prescription_detail prescription_detail_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_detail
    ADD CONSTRAINT prescription_detail_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescription_header(id) ON DELETE CASCADE;


--
-- Name: basket; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.basket ENABLE ROW LEVEL SECURITY;

--
-- Name: cobot_task; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cobot_task ENABLE ROW LEVEL SECURITY;

--
-- Name: department_dictionary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department_dictionary ENABLE ROW LEVEL SECURITY;

--
-- Name: machine_part_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.machine_part_status ENABLE ROW LEVEL SECURITY;

--
-- Name: machine_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.machine_status ENABLE ROW LEVEL SECURITY;

--
-- Name: medicine_dictionary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medicine_dictionary ENABLE ROW LEVEL SECURITY;

--
-- Name: prescription_detail; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prescription_detail ENABLE ROW LEVEL SECURITY;

--
-- Name: prescription_header; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prescription_header ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict uxY6YvPgqbI7Jn2cIkWiXX9HHVk9NmhXfsc7Yl0VOAlU4dI2lf6a07b1sGq6v0C

