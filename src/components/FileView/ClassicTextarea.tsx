import React from 'react'

const ClassicTextarea = () => {
  const laptopScreen = 1980;

  return (
    <textarea className='h-[calc(100vh-63)] border-2' style={{width: laptopScreen}}>
      hello
    </textarea>
  )
}

export default ClassicTextarea