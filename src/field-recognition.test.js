import {it,expect} from 'vitest';
import {suggestFormFields} from './field-recognition';
import {createDetectedFields,fillFormValues,inspectForms} from './forms';
import {PDFDocument,PDFName,PDFDict} from 'pdf-lib';

it('groups character boxes, rejects occupied areas and avoids existing widgets and borders',()=>{
  const rectangles=[{x:20,y:100,width:10,height:10},...Array.from({length:6},(_,i)=>({x:20+i*10,y:150,width:10,height:10})),{x:20,y:200,width:100,height:20}];
  const proposals=suggestFormFields({rectangles,horizontal:[{x:20,y:220,width:100}],cells:[]},()=>true,0);
  expect(proposals.map(p=>p.type)).toEqual(['text','text','checkbox']);
  expect(proposals.find(p=>p.comb).comb).toBe(6);
  expect(suggestFormFields({rectangles,horizontal:[],cells:[]},()=>false,0)).toEqual([]);
  const existing=[{rect:{x:20,y:200,width:100,height:20}}];
  expect(suggestFormFields({rectangles,horizontal:[],cells:[]},()=>true,0,existing)).toHaveLength(2);
});
it('saves actual form values, character limits and fresh widget appearances without flattening',async()=>{
  const doc=await PDFDocument.create();doc.addPage([400,500]);
  const bytes=await createDetectedFields(await doc.save(),[
    {pageIndex:0,type:'text',comb:6,rect:{x:40,y:400,width:60,height:12}},
    {pageIndex:0,type:'checkbox',rect:{x:40,y:350,width:10,height:10}},
  ]);
  const fields=await inspectForms(bytes),text=fields.find(f=>f.type==='text'),check=fields.find(f=>f.type==='checkbox');
  expect(text.maxLength).toBe(6);expect(text.combed).toBe(true);
  const output=await fillFormValues(bytes,{[text.name]:'123456',[check.name]:true});
  const reopened=await PDFDocument.load(output);
  expect(reopened.getForm().getTextField(text.name).getText()).toBe('123456');
  expect(reopened.getForm().getCheckBox(check.name).isChecked()).toBe(true);
  for(const field of reopened.getForm().getFields())for(const widget of field.acroField.getWidgets())expect(widget.dict.lookup(PDFName.of('AP'),PDFDict).has(PDFName.of('N'))).toBe(true);
  await expect(fillFormValues(bytes,{[text.name]:'1234567'})).rejects.toThrow();
  await expect(createDetectedFields(bytes,[{pageIndex:0,type:'text',rect:{x:40,y:400,width:60,height:12}}])).rejects.toThrow(/overlaps/);
});
