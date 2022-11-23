import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import Divider from '@mui/material/Divider';
import Slider from '@mui/material/Slider'
import Box from '@mui/material/Box'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'


const Config = ({label,value,min,max,step,onChange}) => (<>
  <Typography>
    {label}
  </Typography>
  <Slider valueLabelDisplay='auto'
    size='small' sx={{width: 200}}
    min={min} max={max} step={step}
    value={value} onChange={onChange}
  />
</>)

const ParamConfigs = ({conf, setConf}) => (<>
  <FormControlLabel
    control={
      <Switch checked={conf.csearch} onChange={
        _ => setConf({...conf, top_k: conf.csearch ? 0 : 6, csearch: !conf.csearch})
      }/>
    } label='Enable contrastive search'
  />
  <Box>
    <Config
      label="top_k" value={conf.top_k}
      min={conf.csearch ? 1 : 0} max={10} step={1}
      onChange={e => setConf({...conf, top_k: +e.target.value})}
    />
    {conf.csearch ? 
      <Config
        label='Penalty α' value={conf.p_alpha}
        min={0} max={1} step={0.05}
        onChange={e => setConf({...conf, p_alpha: +e.target.value})}
      /> : <>
      <Config 
        label='Temperature' value={conf.temp}
        min={0} max={1.5} step={0.05}
        onChange={e => setConf({...conf, temp: +e.target.value})}
      />
      <Config
        label='top_p' value={conf.top_p}
        min={0} max={1.0} step={0.05}
        onChange={e => setConf({...conf, top_p: +e.target.value})}
      />
    </>
    }
  </Box>
</>)

const CtxConfigs = ({ctx, setCtx}) => (<Box>
  <Config
    label="Context (max chars in prompt)" value={ctx.prior}
    min={50} max={500} step={25}
    onChange={e => setCtx({...ctx, prior: +e.target.value})}
  />
  <Config
    label="Extend by (max tokens produced)" value={ctx.extend}
    min={20} max={200} step={5}
    onChange={e => setCtx({...ctx, extend: +e.target.value})}
  />
</Box>)

const APConfigs = ({ap, setAP, usingMobile}) => (<Box>
  <FormControlLabel disabled={usingMobile}
    control={
      <Switch checked={ap.active} onChange={
        () => setAP({...ap, active: !ap.active})
      }/>
    } label='Enable auto-complete'
  />
  <Config
    label='Auto-complete delay' value={ap.delay}
    min={1000} max={5000} step={100}
    onChange={e => setAP({...ap, delay: +e.target.value})}
  />
</Box>)

const PredictConfiguration = ({conf,setConf, ctx, setCtx, autopredict, setAutopredict, usingMobile}) => {
  return <Accordion sx={{
    maxWidth: 500
  }} disableGutters>
    <AccordionSummary sx={{
      backgroundColor: 'rgba(0,0,0,0.03)'
    }}
      expandIcon={<ExpandMoreIcon/>}
    >
      <Typography> Generation Options </Typography>
    </AccordionSummary>
    <AccordionDetails>
      <Divider>Auto-complete</Divider>
      <APConfigs ap={autopredict} setAP={setAutopredict} usingMobile={usingMobile}/>
      <Divider sx={{ marginBottom: 1 }}>Tokens</Divider>
      <CtxConfigs ctx={ctx} setCtx={setCtx}/>
      <Divider>Model params</Divider>
      <ParamConfigs conf={conf} setConf={setConf}/>
    </AccordionDetails>
  </Accordion>
}

export default PredictConfiguration
